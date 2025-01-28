/// <reference types="@cloudflare/workers-types/experimental" />
import { beforeEach, describe, expect, it } from 'vitest'

import worker from '../../src/index'
import { createMockBrowser, createTestEnv } from '../utils'

interface LinksResponse {
	url: string
	count: number
	links: string[]
}

describe('Links Endpoint', () => {
	const EXPECTED_LINKS = [
		'https://example.com/pricing',
		'https://example.com/features',
		'https://example.com/about',
		'https://example.com/docs',
		'https://example.com/getting-started',
		'https://example.com/support',
		'https://example.com/contact',
		'https://example.com/faq',
	]

	beforeEach(() => {
		createMockBrowser((fn: Function | string, ...args: any[]) => {
			// For link extraction
			if (typeof fn === 'function' && args[0] === 'https://example.com') {
				return EXPECTED_LINKS
			}
			return null
		})
	})

	it('extracts internal links from a webpage', async () => {
		const request = new Request(
			'http://localhost/links/https://example.com',
		)
		const response = await worker.fetch(request, createTestEnv() as any)
		const result = (await response.json()) as LinksResponse

		// Test response structure
		expect(response.status).toBe(200)
		expect(response.headers.get('Content-Type')).toBe('application/json')
		expect(response.headers.get('Cache-Control')).toBe(
			'public, max-age=3600',
		)

		// Test response content
		expect(result).toEqual({
			url: 'https://example.com',
			count: EXPECTED_LINKS.length + 1,
			links: ['https://example.com', ...EXPECTED_LINKS],
		})

		// Verify links are all internal to example.com
		result.links.forEach((link: string) => {
			expect(link).toMatch(/^https:\/\/example\.com/)
		})
	})

	it('handles invalid URLs appropriately', async () => {
		const request = new Request('http://localhost/links/not-a-valid-url')
		const response = await worker.fetch(request, createTestEnv() as any)

		expect(response.status).toBe(400)
		expect(await response.text()).toContain('Invalid URL')
	})

	it('handles missing URLs appropriately', async () => {
		const request = new Request('http://localhost/links')
		const response = await worker.fetch(request, createTestEnv() as any)

		expect(response.status).toBe(400)
		expect(await response.text()).toContain('Please provide a URL')
	})
})
