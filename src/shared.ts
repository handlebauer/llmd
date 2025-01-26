import { writeFile } from 'fs/promises'
import { join } from 'path'

import { TURNDOWN_SCRIPT } from './constants'
import { ProcessingError } from './errors'
import { isBlockedDomain, isBlockedMedia } from './utils'

import type { Page as CloudflarePage } from '@cloudflare/puppeteer'
import type { HTTPRequest, Page as PuppeteerPage } from 'puppeteer'

// Common request interception logic
function handleRequest(request: any) {
	const { hostname, pathname } = new URL(request.url())
	const isBlocked = isBlockedDomain(hostname) || isBlockedMedia(pathname)
	isBlocked ? request.abort() : request.continue()
}

// Page management for regular Puppeteer
export async function setupPuppeteerPageInterception(
	page: PuppeteerPage,
): Promise<void> {
	await page.setRequestInterception(true)
	page.on('request', handleRequest)
}

// Page management for Cloudflare Puppeteer
export async function setupCloudflarePageInterception(
	page: CloudflarePage,
): Promise<void> {
	await page.setRequestInterception(true)
	page.on('request', handleRequest)
}

// Navigation for both implementations
export async function navigateWithFallback(
	page: PuppeteerPage | CloudflarePage,
	url: string,
	timeoutMs = 15000,
): Promise<void> {
	const navigationOptions = { timeout: timeoutMs }
	try {
		await page.goto(url, { ...navigationOptions, waitUntil: 'load' })
	} catch {
		await page.goto(url, {
			...navigationOptions,
			waitUntil: 'networkidle0',
		})
	}
}

// Common page processing types and functions
interface ProcessingContext {
	hostname: string
	isLocal: boolean
}

async function injectScripts(page: PuppeteerPage | CloudflarePage) {
	await page.addScriptTag({ url: TURNDOWN_SCRIPT })
}

async function writeDebugFile(
	context: ProcessingContext,
	content: string,
	stage: string,
	extension: string,
) {
	if (!context.isLocal) return

	const filename = `${context.hostname}.${stage}.${extension}`
	const filepath = join('_debug', filename)
	await writeFile(filepath, content, 'utf-8')
	console.log(`[DEBUG] Wrote ${stage} content to ${filepath}`)
}

// Common HTML cleaning selectors
const NON_CONTENT_SELECTORS = [
	'script',
	'style',
	'iframe',
	'noscript',
	'header nav',
	'nav:not([aria-label])',
	'footer',
	'[role="navigation"]',
	'[role="banner"]',
	'[role="contentinfo"]',
	'[role="complementary"]',
	'[aria-hidden="true"]',
	'[data-nosnippet]',
	'.cookie-banner',
	'.ad',
	'.ads',
	'.advertisement',
	'#comments',
	'.comments',
	// Footer selectors
	'.colophon',
	'.site-footer',
	'.footer',
	'.footer-content',
	'.footer-widgets',
	'[class*="footer"]',
	'[id*="footer"]',
	'.bottom-bar',
	'.bottom-content',
	// Common UI elements
	'.go-to-top',
	'.scroll-to-top',
	'.back-to-top',
	'[class*="to-top"]',
	'[id*="to-top"]',
	'.hidden-print',
	'[aria-hidden]',
	'[class*="social-"]',
	'.share-buttons',
	'.print-button',
]

// Common Turndown configuration and rules
const TURNDOWN_CONFIG = {
	headingStyle: 'atx',
	codeBlockStyle: 'fenced',
	bulletListMarker: '-',
}

// Types for Turndown rules
interface TurndownRule {
	filter: string | string[]
	replacement: string
}

// Rules defined as strings to be evaluated in browser context
const TURNDOWN_RULES: Record<string, TurndownRule> = {
	list: {
		filter: ['ul', 'ol'],
		replacement: `(content, node) => {
			const parent = node.parentNode
			const isNested = parent && (parent.nodeName === 'UL' || parent.nodeName === 'OL')
			const items = content.trim().replace(/^\\n+|\\n+$/g, '')
			return (isNested ? '\\n' : '\\n') + items + (isNested ? '' : '\\n\\n  ')
		}`,
	},
	listItem: {
		filter: 'li',
		replacement: `(content, node, options) => {
			content = content
				.replace(/^\\n+/, '')
				.replace(/\\n+$/, '\\n')
				.replace(/\\n/gm, '\\n  ')
			const prefix = options.bulletListMarker + ' '
			return prefix + content + (node.nextSibling && !/\\n$/.test(content) ? '\\n' : '')
		}`,
	},
	table: {
		filter: ['table'],
		replacement: `(_, node) => {
			const rows = node.rows
			const headers = Array.from(rows[0].cells)
				.map(cell => cell.textContent)
				.join(' | ')
			const separator = Array(rows[0].cells.length)
				.fill('---')
				.join(' | ')
			const body = Array.from(rows)
				.slice(1)
				.map(row =>
					Array.from(row.cells)
						.map(cell => cell.textContent)
						.join(' | '),
				)
				.join('\\n')

			return '\\n' + headers + '\\n' + separator + '\\n' + body + '\\n'
		}`,
	},
}

// Common page processing function
async function processPage(
	page: PuppeteerPage | CloudflarePage,
	isLocal: boolean,
): Promise<string> {
	console.log('[DEBUG] Starting page evaluation')
	const hostname = new URL(page.url()).hostname

	// Fetch Turndown script content
	console.log('[DEBUG] Fetching Turndown script')
	const turndownResponse = await fetch(TURNDOWN_SCRIPT)
	if (!turndownResponse.ok) {
		throw new ProcessingError('Failed to fetch Turndown script')
	}
	const turndownScriptContent = await turndownResponse.text()

	// Get the cleaned HTML content
	const htmlContent = await (page.evaluate as any)((selectors: string[]) => {
		try {
			const documentClone = document.cloneNode(true) as Document
			documentClone
				.querySelectorAll(selectors.join(','))
				.forEach(el => el.remove())

			return documentClone.body.innerHTML
		} catch (error) {
			throw new Error((error as Error).message)
		}
	}, NON_CONTENT_SELECTORS).catch((error: Error) => {
		throw new ProcessingError(error.message)
	})

	// Write HTML debug output
	await writeDebugFile({ hostname, isLocal }, htmlContent, 'raw', 'html')

	// Convert to markdown
	const markdown = await (page.evaluate as any)(
		(
			content: string,
			config: any,
			rules: Record<string, TurndownRule>,
			scriptContent: string,
		) => {
			return new Promise((resolve, reject) => {
				try {
					// Inject Turndown script inline
					const script = document.createElement('script')
					script.textContent = scriptContent
					document.head.appendChild(script)

					const TurndownService = (window as any).TurndownService
					if (!TurndownService) {
						throw new Error(
							'TurndownService library failed to load',
						)
					}

					const turndownService = new TurndownService(config)

					// Add custom rules with compiled functions
					Object.entries(rules).forEach(([name, rule]) => {
						turndownService.addRule(name, {
							...rule,
							replacement: new Function(
								'return ' + rule.replacement,
							)(),
						})
					})

					const result = turndownService.turndown(content)
					resolve(result)
				} catch (error) {
					reject(new Error((error as Error).message))
				}
			})
		},
		htmlContent,
		TURNDOWN_CONFIG,
		TURNDOWN_RULES,
		turndownScriptContent,
	).catch((error: Error) => {
		throw new ProcessingError(error.message)
	})

	// Write Markdown debug output
	await writeDebugFile({ hostname, isLocal }, markdown, 'turndown', 'md')

	return markdown || 'No content after conversion'
}

// Page processing for regular Puppeteer
export async function processPuppeteerPage(
	page: PuppeteerPage,
): Promise<string> {
	return processPage(page, true)
}

// Page processing for Cloudflare Puppeteer
export async function processCloudFlarePage(
	page: CloudflarePage,
): Promise<string> {
	return processPage(page, false)
}
