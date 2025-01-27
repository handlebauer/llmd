/// <reference types="@cloudflare/workers-types" />
import { crawlSite, extractInternalLinks } from '../core/links'
import { processCloudFlarePage } from '../core/markdown'
import {
	initializeCloudflareWorker,
	navigateWithFallback,
} from '../utils/browser'
import { ValidationError } from '../utils/errors'
import { validateUrl } from '../utils/validation'

import type { Environment } from '../utils/types'

// Declare global types for the Worker environment
declare global {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	var TurndownService: any
}

// Types
type Env = Environment

// Main worker handler
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		try {
			// Handle CORS preflight requests
			if (request.method === 'OPTIONS') {
				return new Response(null, {
					headers: {
						'Access-Control-Allow-Origin':
							request.headers.get('Origin') || '*',
						'Access-Control-Allow-Methods': 'GET, OPTIONS',
						'Access-Control-Allow-Headers': 'Content-Type',
						'Access-Control-Max-Age': '86400',
					},
				})
			}

			const url = new URL(request.url)
			const path = url.pathname

			// Extract the target URL from the path
			const [, action, ...rest] = path.split('/')
			const targetUrl = rest.join('/')

			if (!targetUrl) {
				return new Response(
					'Please provide a URL in the path: /[action]/https://example.com',
					{
						status: 400,
						headers: {
							'Access-Control-Allow-Origin':
								request.headers.get('Origin') || '*',
						},
					},
				)
			}

			const validatedUrl = validateUrl(
				decodeURIComponent(targetUrl),
				'Please provide a valid URL in the path',
			)

			// Check cache based on action
			const cacheKey = `${action}:${validatedUrl}`
			const cached =
				action === 'scrape'
					? await env.URL_CACHE.get(cacheKey) // Get raw text for markdown
					: await env.URL_CACHE.get(cacheKey, 'json') // Parse JSON for other actions
			if (cached) {
				console.log(`[DEBUG] Cache hit for ${cacheKey}`)
				const headers = {
					'Content-Type':
						action === 'scrape'
							? 'text/markdown'
							: 'application/json',
					'Cache-Control': 'public, max-age=3600',
					'Access-Control-Allow-Origin':
						request.headers.get('Origin') || '*',
				}
				const responseText =
					action === 'scrape'
						? String(cached)
						: JSON.stringify(cached)
				return new Response(responseText, { headers })
			}

			const { browser, page } = await initializeCloudflareWorker(env)

			try {
				switch (action) {
					case 'scrape': {
						await navigateWithFallback(page, validatedUrl)
						const markdown = await processCloudFlarePage(page)

						// Cache the scrape result
						await env.URL_CACHE.put(
							cacheKey,
							markdown,
							{ expirationTtl: 150 }, // 2.5 minutes
						)

						return new Response(markdown, {
							headers: {
								'Content-Type': 'text/markdown',
								'Cache-Control': 'public, max-age=3600',
								'Access-Control-Allow-Origin':
									request.headers.get('Origin') || '*',
							},
						})
					}

					case 'crawl': {
						const result = await crawlSite(
							page,
							validatedUrl,
							10,
							processCloudFlarePage,
							env,
						)

						// Cache the crawl result
						await env.URL_CACHE.put(
							cacheKey,
							JSON.stringify(result),
							{ expirationTtl: 150 }, // 2.5 minutes
						)

						return new Response(JSON.stringify(result), {
							headers: {
								'Content-Type': 'application/json',
								'Cache-Control': 'public, max-age=3600',
								'Access-Control-Allow-Origin':
									request.headers.get('Origin') || '*',
							},
						})
					}

					case 'links': {
						await navigateWithFallback(page, validatedUrl)
						const links = await extractInternalLinks(
							page,
							validatedUrl,
						)
						const result = {
							url: validatedUrl,
							count: links.length,
							links,
						}

						// Cache the links result
						await env.URL_CACHE.put(
							cacheKey,
							JSON.stringify(result),
							{ expirationTtl: 150 }, // 2.5 minutes
						)

						return new Response(JSON.stringify(result), {
							headers: {
								'Content-Type': 'application/json',
								'Cache-Control': 'public, max-age=3600',
								'Access-Control-Allow-Origin':
									request.headers.get('Origin') || '*',
							},
						})
					}

					default:
						return new Response(
							'Invalid action. Use /scrape/, /crawl/, or /links/',
							{
								status: 400,
								headers: {
									'Access-Control-Allow-Origin':
										request.headers.get('Origin') || '*',
								},
							},
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
				return new Response(error.message, {
					status: 400,
					headers: {
						'Access-Control-Allow-Origin':
							request.headers.get('Origin') || '*',
					},
				})
			}

			return new Response(
				error instanceof Error
					? error.message
					: 'Internal server error',
				{
					status: 500,
					headers: {
						'Access-Control-Allow-Origin':
							request.headers.get('Origin') || '*',
					},
				},
			)
		}
	},
} satisfies ExportedHandler<Env>
