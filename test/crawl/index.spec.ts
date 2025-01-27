/// <reference types="@cloudflare/workers-types/experimental" />
import { beforeEach, describe, expect, it } from 'vitest'

import worker from '../../src/index'
import { createMockBrowser, createTestEnv } from '../utils'

interface CrawlResponse {
	url: string
	markdown: string
}

describe('Crawl Endpoint', () => {
	const EXPECTED_LINKS = [
		'https://example.com/pricing',
		'https://example.com/features',
		'https://example.com/about',
	]

	const EXPECTED_MARKDOWN = `# Example Page`

	beforeEach(() => {
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
		const response = await worker.fetch(request, createTestEnv() as any)
		const results = (await response.json()) as CrawlResponse[]

		// Test response structure
		expect(response.status).toBe(200)
		expect(response.headers.get('Content-Type')).toBe('application/json')
		expect(response.headers.get('Cache-Control')).toBe(
			'public, max-age=3600',
		)

		// Test response content
		expect(results).toHaveLength(EXPECTED_LINKS.length + 1) // +1 for the root URL
		expect(results).toContainEqual({
			url: 'https://example.com',
			markdown: EXPECTED_MARKDOWN,
		})

		// Verify all crawled pages are converted
		EXPECTED_LINKS.forEach(url => {
			expect(results).toContainEqual({
				url,
				markdown: EXPECTED_MARKDOWN,
			})
		})
	})

	it('handles invalid URLs appropriately', async () => {
		const request = new Request('http://localhost/crawl/not-a-valid-url')
		const response = await worker.fetch(request, createTestEnv() as any)

		expect(response.status).toBe(400)
		expect(await response.text()).toContain('Invalid URL')
	})

	it('handles missing URLs appropriately', async () => {
		const request = new Request('http://localhost/crawl')
		const response = await worker.fetch(request, createTestEnv() as any)

		expect(response.status).toBe(400)
		expect(await response.text()).toContain('Please provide a URL')
	})
})
