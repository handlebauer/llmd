import { isBlockedDomain, isBlockedMedia } from './validation'

import type { Page } from './types'

// Common request interception logic
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
		isBlocked ? request.abort() : request.continue()
	} catch (error) {
		// If URL parsing fails, continue the request
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

// Browser initialization for Cloudflare
export async function initializeCloudflareWorker(env: { MYBROWSER: Fetcher }) {
	const browser = await (
		await import('@cloudflare/puppeteer')
	).default.launch(env.MYBROWSER)
	const page = (await browser.newPage()) as Page
	console.log('[DEBUG] Browser initialized and page created')
	return { browser, page }
}

// Browser initialization for local environment
export async function initializeLocalBrowser() {
	const browser = await (await import('puppeteer')).default.launch()
	const page = (await browser.newPage()) as Page
	console.log('[DEBUG] Browser initialized and page created')
	return { browser, page }
}
