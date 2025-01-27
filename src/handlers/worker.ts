import { crawlSite, extractInternalLinks, processCloudFlarePage } from '../core'
import {
	initializeCloudflareWorker,
	navigateWithFallback,
	setupCloudflarePageInterception,
} from '../utils/browser'
import { ValidationError } from '../utils/errors'
import { validateUrl } from '../utils/validation'

// Declare global types for the Worker environment
declare global {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	var TurndownService: any
}

// Types
interface Env {
	MYBROWSER: Fetcher
}

// Main worker handler
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		try {
			const url = new URL(request.url)
			const path = url.pathname

			// Extract the target URL from the path
			const [, action, ...rest] = path.split('/')
			const targetUrl = rest.join('/')

			if (!targetUrl) {
				return new Response(
					'Please provide a URL in the path: /[action]/https://example.com',
					{ status: 400 },
				)
			}

			const validatedUrl = validateUrl(
				decodeURIComponent(targetUrl),
				'Please provide a valid URL in the path',
			)

			const { browser, page } = await initializeCloudflareWorker(env)

			try {
				await setupCloudflarePageInterception(page)

				switch (action) {
					case 'scrape': {
						await navigateWithFallback(page, validatedUrl)
						const markdown = await processCloudFlarePage(page)
						return new Response(markdown, {
							headers: {
								'Content-Type': 'text/markdown',
								'Cache-Control': 'public, max-age=3600',
							},
						})
					}

					case 'crawl': {
						const results = await crawlSite(
							page,
							validatedUrl,
							10,
							processCloudFlarePage,
						)

						return new Response(JSON.stringify(results), {
							headers: {
								'Content-Type': 'application/json',
								'Cache-Control': 'public, max-age=3600',
							},
						})
					}

					case 'links': {
						await navigateWithFallback(page, validatedUrl)
						const links = await extractInternalLinks(
							page,
							validatedUrl,
						)
						return new Response(
							JSON.stringify({
								url: validatedUrl,
								count: links.length,
								links,
							}),
							{
								headers: {
									'Content-Type': 'application/json',
									'Cache-Control': 'public, max-age=3600',
								},
							},
						)
					}

					default:
						return new Response(
							'Invalid action. Use /scrape/, /crawl/, or /links/',
							{ status: 400 },
						)
				}
			} finally {
				await page.close()
				await browser.close()
			}
		} catch (error) {
			console.error('[DEBUG] Error details:', {
				name: error instanceof Error ? error.name : 'Unknown',
				message:
					error instanceof Error ? error.message : 'Unknown error',
				stack: error instanceof Error ? error.stack : undefined,
			})

			if (error instanceof ValidationError) {
				return new Response(error.message, { status: 400 })
			}

			return new Response(
				error instanceof Error
					? error.message
					: 'Internal server error',
				{ status: 500 },
			)
		}
	},
} satisfies ExportedHandler<Env>
