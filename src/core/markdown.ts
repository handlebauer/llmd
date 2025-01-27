import { NON_CONTENT_SELECTORS, TURNDOWN_SCRIPT } from '../utils/constants'
import { ProcessingError } from '../utils/errors'

import type { Page } from '../utils/types'

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
async function processPage(page: Page, isLocal: boolean): Promise<string> {
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

	// Write HTML debug output if local
	if (isLocal) {
		await writeDebugFile(hostname, htmlContent, 'raw', 'html')
	}

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

	// Write Markdown debug output if local
	if (isLocal) {
		await writeDebugFile(hostname, markdown, 'turndown', 'md')
	}

	return markdown || 'No content after conversion'
}

// Debug file writing for local development
async function writeDebugFile(
	hostname: string,
	content: string,
	stage: string,
	extension: string,
): Promise<void> {
	try {
		const { writeFile } = await import('fs/promises')
		const { join } = await import('path')
		const filename = `${hostname}.${stage}.${extension}`
		const filepath = join('_debug', filename)
		await writeFile(filepath, content, 'utf-8')
		console.log(`[DEBUG] Wrote ${stage} content to ${filepath}`)
	} catch (error) {
		console.error(`Failed to write debug file: ${error}`)
	}
}

// Page processing for regular Puppeteer (local)
export async function processPuppeteerPage(page: Page): Promise<string> {
	return processPage(page, true)
}

// Page processing for Cloudflare Puppeteer (worker)
export async function processCloudFlarePage(page: Page): Promise<string> {
	return processPage(page, false)
}
