/// <reference types="@cloudflare/workers-types/experimental" />
import { beforeEach, describe, expect, it, vi } from 'vitest'

import worker from '../../src/index'
import { createMockBrowser, createTestEnv } from '../utils'

import type { CrawlSiteResult } from '../../src/core/links'

describe('Crawl Endpoint', () => {
	const EXPECTED_LINKS = [
		'https://example.com/pricing',
		'https://example.com/features',
		'https://example.com/about',
	]

	const EXPECTED_MARKDOWN = `# Example Page`
	let testEnv: ReturnType<typeof createTestEnv>

	beforeEach(() => {
		testEnv = createTestEnv()
		createMockBrowser((fn: Function | string, ...args: any[]) => {
			// For link extraction during crawl
			if (typeof fn === 'function' && args[0] === 'https://example.com') {
				return EXPECTED_LINKS
			}
			// For markdown conversion of each page
			if (
				typeof fn === 'function' &&
				args.length === 4 &&
				typeof args[0] === 'string' &&
				typeof args[1] === 'object'
			) {
				return EXPECTED_MARKDOWN
			}
			return null
		})
	})

	it('crawls and converts multiple pages to markdown', async () => {
		const request = new Request(
			'http://localhost/crawl/https://example.com',
		)
		const response = await worker.fetch(request, testEnv)
		const result = (await response.json()) as CrawlSiteResult

		// Test response structure
		expect(response.status).toBe(200)
		expect(response.headers.get('Content-Type')).toBe('application/json')
		expect(response.headers.get('Cache-Control')).toBe(
			'public, max-age=3600',
		)

		// Test links array
		expect(result.links).toEqual(expect.arrayContaining(EXPECTED_LINKS))
		expect(result.links).toContain('https://example.com')

		// Test pages array
		expect(result.pages).toHaveLength(EXPECTED_LINKS.length + 1) // +1 for the root URL
		expect(result.pages).toContainEqual({
			url: 'https://example.com',
			markdown: EXPECTED_MARKDOWN,
		})

		// Verify all crawled pages are converted
		EXPECTED_LINKS.forEach(url => {
			expect(result.pages).toContainEqual({
				url,
				markdown: EXPECTED_MARKDOWN,
			})
		})

		// Test metadata structure
		expect(result.metadata).toMatchObject({
			timing: {
				durationMs: expect.any(Number),
				averagePageTimeMs: expect.any(Number),
			},
			stats: {
				successfulPages: EXPECTED_LINKS.length + 1,
				failedPages: 0,
				uniqueLinksDiscovered: EXPECTED_LINKS.length + 1,
				maxDepthReached: expect.any(Number),
				hitMaxPages: expect.any(Boolean),
			},
			errors: [],
			config: {
				baseUrl: 'https://example.com',
				maxPages: expect.any(Number),
			},
		})
	})

	it('returns cached results when available', async () => {
		const cachedResult: CrawlSiteResult = {
			links: EXPECTED_LINKS,
			pages: [
				{ url: 'https://example.com', markdown: EXPECTED_MARKDOWN },
			],
			metadata: {
				timing: { durationMs: 100, averagePageTimeMs: 100 },
				stats: {
					successfulPages: 1,
					failedPages: 0,
					uniqueLinksDiscovered: 1,
					maxDepthReached: 0,
					hitMaxPages: false,
				},
				errors: [],
				config: { baseUrl: 'https://example.com', maxPages: 10 },
			},
		}

		// Mock the cache to return our result
		const envWithCache = {
			...testEnv,
			URL_CACHE: {
				...testEnv.URL_CACHE,
				get: vi.fn().mockResolvedValue(cachedResult),
				getWithMetadata: async () => ({
					value: cachedResult,
					metadata: null,
				}),
				getWithOptions: async () => cachedResult,
			} as unknown as KVNamespace,
		}

		const request = new Request(
			'http://localhost/crawl/https://example.com',
		)
		const response = await worker.fetch(request, envWithCache)
		const result = await response.json()

		expect(response.status).toBe(200)
		expect(result).toEqual(cachedResult)
		expect(envWithCache.URL_CACHE.get).toHaveBeenCalledWith(
			'crawl:https://example.com',
			'json',
		)
	})

	it('handles invalid URLs appropriately', async () => {
		const request = new Request('http://localhost/crawl/not-a-valid-url')
		const response = await worker.fetch(request, testEnv)

		expect(response.status).toBe(400)
		expect(await response.text()).toContain('Invalid URL')
	})

	it('handles missing URLs appropriately', async () => {
		const request = new Request('http://localhost/crawl')
		const response = await worker.fetch(request, testEnv)

		expect(response.status).toBe(400)
		expect(await response.text()).toContain('Please provide a URL')
	})
})
