import puppeteer from '@cloudflare/puppeteer'

import {
	navigateWithFallback,
	processCloudFlarePage,
	setupCloudflarePageInterception,
} from './shared'
import { validateUrl } from './utils'

// Declare global types for the Worker environment
declare global {
	var TurndownService: any
}

// Types
interface Env {
	MYBROWSER: Fetcher
}

// Browser management
async function initializeBrowser(env: Env) {
	const browser = await puppeteer.launch(env.MYBROWSER)
	const page = await browser.newPage()
	console.log('[DEBUG] Browser initialized and page created')
	return { browser, page }
}

// Main worker handler
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		try {
			const url = new URL(request.url)
			// Remove the first slash and decode the rest of the path
			const targetUrl = decodeURIComponent(url.pathname.slice(1))

			const validatedUrl = validateUrl(
				targetUrl || null,
				'Please provide a URL in the path: /https://example.com',
			)

			const { browser, page } = await initializeBrowser(env)
			try {
				await setupCloudflarePageInterception(page)
				await navigateWithFallback(page, validatedUrl)
				const markdown = await processCloudFlarePage(page)

				return new Response(markdown, {
					headers: {
						'Content-Type': 'text/markdown',
						'Cache-Control': 'public, max-age=3600',
					},
				})
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

			const status =
				error instanceof Error && error.name === 'ValidationError'
					? 400
					: 500
			const message =
				error instanceof Error ? error.message : 'Internal server error'

			return new Response(message, { status })
		}
	},
} satisfies ExportedHandler<Env>
