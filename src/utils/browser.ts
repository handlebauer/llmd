import { isBlockedDomain, isBlockedMedia } from './validation'

import type { Environment, Page } from './types'

// Common request interception logic
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleRequest(request: any) {
	try {
		const { hostname, pathname } = new URL(request.url())

		// Always allow navigation and document requests
		const resourceType = request.resourceType()
		if (resourceType === 'document' || resourceType === 'navigation') {
			request.continue()
			return
		}

		const isBlocked = isBlockedDomain(hostname) || isBlockedMedia(pathname)
		if (isBlocked) {
			console.log(
				`[DEBUG] Blocked request: ${request.url()} (${resourceType})`,
			)
			request.abort()
		} else {
			request.continue()
		}
	} catch (_) {
		// If URL parsing fails, continue the request
		console.log(`[DEBUG] URL parsing failed for request: ${request.url()}`)
		request.continue()
	}
}

// Page management for regular Puppeteer
export async function setupPuppeteerPageInterception(
	page: Page,
): Promise<void> {
	await page.setRequestInterception(true)
	page.on('request', handleRequest)
}

// Page management for Cloudflare Puppeteer
export async function setupCloudflarePageInterception(
	page: Page,
): Promise<void> {
	await page.setRequestInterception(true)
	page.on('request', handleRequest)
}

// Navigation for both implementations
export async function navigateWithFallback(
	page: Page,
	url: string,
	timeoutMs = 30000,
): Promise<void> {
	const navigationOptions = { timeout: timeoutMs }
	try {
		console.log(
			`[DEBUG] Attempting navigation to ${url} with 'load' strategy`,
		)
		await page.goto(url, { ...navigationOptions, waitUntil: 'load' })
	} catch (error) {
		console.log(
			`[DEBUG] 'load' strategy failed, trying 'networkidle0': ${error instanceof Error ? error.message : 'Unknown error'}`,
		)
		try {
			await page.goto(url, {
				...navigationOptions,
				waitUntil: 'networkidle0',
			})
		} catch (fallbackError) {
			console.error(
				`[ERROR] Both navigation strategies failed for ${url}:`,
				fallbackError instanceof Error
					? fallbackError.message
					: 'Unknown error',
			)
			throw fallbackError
		}
	}
}

// Browser initialization for Cloudflare
export async function initializeCloudflareWorker(
	env: Pick<Environment, 'MYBROWSER'>,
) {
	const browser = await (
		await import('@cloudflare/puppeteer')
	).default.launch(env.MYBROWSER)
	const page = (await browser.newPage()) as Page

	// Set up request interception before any navigation
	await page.setRequestInterception(false) // Reset first
	await page.setRequestInterception(true)
	page.on('request', handleRequest)

	console.log('[DEBUG] Browser initialized and page created')
	return { browser, page }
}

// Browser initialization for local environment
export async function initializeLocalBrowser() {
	const browser = await (await import('puppeteer')).default.launch()
	const page = (await browser.newPage()) as Page

	// Set up request interception before any navigation
	await page.setRequestInterception(false) // Reset first
	await page.setRequestInterception(true)
	page.on('request', handleRequest)

	console.log('[DEBUG] Browser initialized and page created')
	return { browser, page }
}
