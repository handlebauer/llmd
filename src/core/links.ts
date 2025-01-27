import { navigateWithFallback } from '../utils/browser'

import type { Page } from '../utils/types'

export interface CrawlResult {
	url: string
	markdown: string
}

export interface CrawlMetadata {
	timing: {
		durationMs: number
		averagePageTimeMs: number
	}
	stats: {
		successfulPages: number
		failedPages: number
		uniqueLinksDiscovered: number
		maxDepthReached: number
		hitMaxPages: boolean
	}
	errors: Array<{
		url: string
		error: string
	}>
	config: {
		baseUrl: string
		maxPages: number
	}
}

export interface CrawlSiteResult {
	links: string[]
	pages: CrawlResult[]
	metadata: CrawlMetadata
}

function normalizeUrl(url: string): string {
	try {
		const parsed = new URL(url)
		// Remove trailing slash, index.html, and normalize to root domain
		let path = parsed.pathname
			.replace(/\/$/, '')
			.replace(/\/index(\.html)?$/, '')
		// If path is empty, normalize to root
		path = path || '/'
		return `${parsed.host}${path}${parsed.search}`
	} catch {
		return url
	}
}

export async function extractInternalLinks(
	page: Page,
	baseUrl: string,
): Promise<string[]> {
	const currentUrl = page.url()
	const links = await page.evaluate(baseUrl => {
		const allLinks = Array.from(document.querySelectorAll('a[href]'))
			.map(a => a.getAttribute('href'))
			.filter(href => href !== null) as string[]

		const baseUrlObj = new URL(baseUrl)
		return (
			allLinks
				.map(href => {
					try {
						// Handle relative URLs
						const fullUrl = new URL(href, baseUrl)
						// Only return links that are from the same origin
						if (fullUrl.origin === baseUrlObj.origin) {
							return fullUrl.href
						}
					} catch {
						return null
					}
					return null
				})
				.filter((url): url is string => url !== null)
				// Remove duplicates
				.filter((url, index, self) => self.indexOf(url) === index)
		)
	}, baseUrl)

	// Filter out the current page URL
	return links.filter(link => normalizeUrl(link) !== normalizeUrl(currentUrl))
}

export async function crawlSite(
	page: Page,
	baseUrl: string,
	maxPages: number = 10,
	processPage?: (page: Page) => Promise<string>,
): Promise<CrawlSiteResult> {
	const startTime = new Date()
	const errors: Array<{ url: string; error: string }> = []
	let successfulPages = 0
	let maxDepthReached = 0

	// Reset page state
	await page.setRequestInterception(false)
	await page.setRequestInterception(true)

	const visited = new Set<string>()
	const toVisit = new Set([baseUrl])
	const results: CrawlResult[] = []
	const allLinks = new Set<string>([baseUrl])
	console.log(`[DEBUG] Starting crawl of ${baseUrl} (max pages: ${maxPages})`)

	try {
		while (toVisit.size > 0 && visited.size < maxPages) {
			const url = Array.from(toVisit)[0]
			toVisit.delete(url)

			const normalizedUrl = normalizeUrl(url)
			if (visited.has(normalizedUrl)) {
				console.log(`[DEBUG] Skipping already visited URL: ${url}`)
				continue
			}

			try {
				console.log(`[DEBUG] Attempting to navigate to: ${url}`)
				await navigateWithFallback(page, url)
				console.log(`[DEBUG] Successfully loaded: ${url}`)
				visited.add(normalizedUrl)
				successfulPages++

				// Calculate depth by counting slashes after domain
				const urlPath = new URL(url).pathname
				const depth = urlPath.split('/').filter(Boolean).length
				maxDepthReached = Math.max(maxDepthReached, depth)

				// Process the page content if a processor is provided
				if (processPage) {
					const markdown = await processPage(page)
					results.push({ url, markdown })
				}

				console.log(`[DEBUG] Extracting internal links from ${url}`)
				const newLinks = await extractInternalLinks(page, baseUrl)
				console.log(`[DEBUG] Found ${newLinks.length} internal links`)

				// Add all discovered links to allLinks set
				newLinks.forEach(link => allLinks.add(link))

				let newLinksCount = 0
				newLinks.forEach(link => {
					const normalizedLink = normalizeUrl(link)
					if (
						!visited.has(normalizedLink) &&
						!Array.from(toVisit).some(
							u => normalizeUrl(u) === normalizedLink,
						)
					) {
						toVisit.add(link)
						newLinksCount++
						console.log(`[DEBUG] Adding to queue: ${link}`)
					}
				})
				console.log(
					`[DEBUG] Found ${newLinksCount} new links to process`,
				)
			} catch (error) {
				console.error(`[ERROR] Failed to crawl ${url}:`, error)
				errors.push({
					url,
					error:
						error instanceof Error ? error.message : String(error),
				})
			}
		}

		const durationMs = new Date().getTime() - startTime.getTime()

		console.log(`[DEBUG] Crawl complete. Visited ${visited.size} pages`)
		return {
			links: Array.from(allLinks),
			pages: results,
			metadata: {
				timing: {
					durationMs,
					averagePageTimeMs: Math.round(durationMs / successfulPages),
				},
				stats: {
					successfulPages,
					failedPages: errors.length,
					uniqueLinksDiscovered: allLinks.size,
					maxDepthReached,
					hitMaxPages: visited.size >= maxPages,
				},
				errors,
				config: {
					baseUrl,
					maxPages,
				},
			},
		}
	} finally {
		// Clean up page state
		await page.setRequestInterception(false)
	}
}
