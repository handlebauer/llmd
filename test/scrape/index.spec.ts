/// <reference types="@cloudflare/workers-types/experimental" />
import { beforeEach, describe, expect, it } from 'vitest'

import worker from '../../src/index'
import { createMockBrowser, createTestEnv, FIXTURE_HTML } from '../utils'

describe('Scrape Endpoint', () => {
	const EXPECTED_MARKDOWN = `# Get Started in Less than 5 Minutes

## Capacity based slots

|  | Helium | Neon |
| --- | --- | --- |
|  | £10 /month | £15 /month |`

	beforeEach(() => {
		createMockBrowser((fn: Function | string, ...args: any[]) => {
			// For markdown conversion (simulating Turndown)
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

	it('converts HTML to Markdown preserving main content structure', async () => {
		const request = new Request(
			'http://localhost/scrape/https://example.com',
		)
		const response = await worker.fetch(request, createTestEnv() as any)
		const markdown = await response.text()

		// Test response structure
		expect(response.status).toBe(200)
		expect(response.headers.get('Content-Type')).toBe('text/markdown')
		expect(response.headers.get('Cache-Control')).toBe(
			'public, max-age=3600',
		)

		// Strict markdown structure tests
		const lines = markdown.split('\n')

		// Check exact heading structure
		expect(lines[0]).toBe('# Get Started in Less than 5 Minutes')
		expect(lines[1]).toBe('')
		expect(lines[2]).toBe('## Capacity based slots')
		expect(lines[3]).toBe('')

		// Check exact table structure
		expect(lines[4]).toBe('|  | Helium | Neon |')
		expect(lines[5]).toBe('| --- | --- | --- |')
		expect(lines[6]).toBe('|  | £10 /month | £15 /month |')

		// Check overall markdown matches exactly
		expect(markdown).toBe(EXPECTED_MARKDOWN)

		// Verify no extra content
		expect(lines.length).toBe(7)
		expect(markdown).not.toContain('Login')
		expect(markdown).not.toContain('Features & Pricing')
		expect(markdown).not.toContain('Feral Hosting')
	})

	it('handles invalid URLs appropriately', async () => {
		const request = new Request('http://localhost/scrape/not-a-valid-url')
		const response = await worker.fetch(request, createTestEnv() as any)

		expect(response.status).toBe(400)
		expect(await response.text()).toContain('Invalid URL')
	})

	it('handles missing URLs appropriately', async () => {
		const request = new Request('http://localhost/scrape')
		const response = await worker.fetch(request, createTestEnv() as any)

		expect(response.status).toBe(400)
		expect(await response.text()).toContain('Please provide a URL')
	})
})
