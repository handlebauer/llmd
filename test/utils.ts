import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import puppeteer from '@cloudflare/puppeteer'

import { NON_CONTENT_SELECTORS } from '../src/utils/constants'

export const FIXTURE_HTML = readFileSync(
	join('test', 'fixtures', 'feral-hosting.html'),
	'utf-8',
)

export const createTestEnv = () => ({
	MYBROWSER: {
		fetch: () =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						webSocketDebuggerUrl: 'ws://example.com',
					}),
				),
			),
	},
	URL_CACHE: {
		get: async () => null,
		getWithMetadata: async () => ({ value: null, metadata: null }),
		put: async () => undefined,
		delete: async () => undefined,
		list: async () => ({ keys: [], list_complete: true, cursor: '' }),
		getWithOptions: async () => null,
	} as unknown as KVNamespace,
})

export const createMockBrowser = (
	evaluateFn: (fn: Function | string, ...args: any[]) => any,
) => {
	const mockBrowser = {
		newPage: async () => ({
			close: async () => {},
			setRequestInterception: async () => {},
			on: () => {},
			goto: async () => {},
			url: () => 'https://example.com',
			evaluate: async (fn: Function | string, ...args: any[]) => {
				try {
					// Handle HTML content evaluation
					if (
						typeof fn === 'function' &&
						args[0] === NON_CONTENT_SELECTORS
					) {
						return FIXTURE_HTML
					}

					// Handle Turndown script evaluation
					if (
						typeof fn === 'string' &&
						fn.includes('TurndownService')
					) {
						return await Promise.resolve(evaluateFn(fn, ...args))
					}

					// Handle link extraction
					if (
						typeof fn === 'function' &&
						args[0] === 'https://example.com'
					) {
						return await Promise.resolve(evaluateFn(fn, ...args))
					}

					// Handle markdown conversion
					if (
						typeof fn === 'function' &&
						args.length === 4 &&
						typeof args[0] === 'string' &&
						typeof args[1] === 'object'
					) {
						return await Promise.resolve(evaluateFn(fn, ...args))
					}

					return null
				} catch (error) {
					throw error instanceof Error
						? error
						: new Error(String(error))
				}
			},
			addScriptTag: async () => {},
		}),
		close: async () => {},
	}

	// @ts-ignore - Override the launch method
	puppeteer.launch = () => Promise.resolve(mockBrowser)
	return mockBrowser
}
