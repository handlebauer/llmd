import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Page } from '../../src/utils/types'

// Mock page implementation with just the methods we need
class MockPage {
	private _url: string = 'https://example.com'
	private _content: string = '<html><body><h1>Test Content</h1></body></html>'

	async setRequestInterception(_value: boolean): Promise<void> {}

	on(_event: 'request', _callback: (request: any) => void): void {}

	async goto(
		url: string,
		_options?: { timeout?: number; waitUntil?: 'load' | 'networkidle0' },
	): Promise<any> {
		this._url = url
		return Promise.resolve()
	}

	url(): string {
		return this._url
	}

	async evaluate<T>(
		fn: string | ((arg: any) => T),
		...args: any[]
	): Promise<T> {
		if (typeof fn === 'function') {
			// For link extraction
			if (
				args[0] &&
				typeof args[0] === 'string' &&
				args[0].startsWith('http')
			) {
				return [
					'http://example.com/page1',
					'http://example.com/page2',
				] as T
			}
			// For HTML content extraction
			if (args[0] && Array.isArray(args[0]) && args[0].length > 0) {
				return this._content as T
			}
			// For Turndown conversion
			if (args[0] === this._content) {
				return '# Test Content' as T
			}
		}
		return this._content as T
	}

	async close(): Promise<void> {}
}

describe('CLI Handler', () => {
	let originalArgv: string[]
	let originalConsoleLog: typeof console.log
	let consoleOutput: string[]
	let mockPage: MockPage
	let originalFetch: typeof global.fetch

	beforeEach(async () => {
		originalArgv = process.argv
		originalConsoleLog = console.log
		originalFetch = global.fetch
		consoleOutput = []
		console.log = (...args: any[]) => {
			consoleOutput.push(args.join(' '))
		}

		mockPage = new MockPage()

		// Import and mock the browser module
		const browserModule = await import('../../src/utils/browser')
		const validationModule = await import('../../src/utils/validation')

		// Mock fetch for Turndown script
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			text: () => Promise.resolve('// Mock Turndown script'),
		})

		vi.spyOn(browserModule, 'initializeLocalBrowser').mockImplementation(
			async () => {
				return {
					browser: {
						close: async () => {},
					} as any,
					page: mockPage as unknown as Page,
				}
			},
		)

		vi.spyOn(
			browserModule,
			'setupPuppeteerPageInterception',
		).mockImplementation(async () => {})
		vi.spyOn(browserModule, 'navigateWithFallback').mockImplementation(
			async () => {},
		)
		vi.spyOn(validationModule, 'validateUrl').mockImplementation(
			(url: string | null, errorMessage: string) => {
				if (!url) throw new Error(errorMessage)
				return url
			},
		)
	})

	afterEach(() => {
		process.argv = originalArgv
		console.log = originalConsoleLog
		global.fetch = originalFetch
		vi.restoreAllMocks()
	})

	it('should handle scrape command', async () => {
		process.argv = ['node', 'cli.ts', 'scrape', 'https://example.com']
		const { default: main } = await import('../../src/handlers/cli')
		await main()
		expect(consoleOutput.join('\n')).toContain('# Test Content')
	})

	it('should handle crawl command', async () => {
		process.argv = ['node', 'cli.ts', 'crawl', 'https://example.com']
		const { default: main } = await import('../../src/handlers/cli')
		await main()
		expect(consoleOutput.join('\n')).toContain('http://example.com/page1')
		expect(consoleOutput.join('\n')).toContain('http://example.com/page2')
	})

	it('should handle links command', async () => {
		process.argv = ['node', 'cli.ts', 'links', 'https://example.com']
		const { default: main } = await import('../../src/handlers/cli')
		await main()
		expect(consoleOutput.join('\n')).toContain('http://example.com/page1')
		expect(consoleOutput.join('\n')).toContain('http://example.com/page2')
	})

	it('should handle invalid command', async () => {
		process.argv = ['node', 'cli.ts', 'invalid', 'https://example.com']
		const { default: main } = await import('../../src/handlers/cli')
		await expect(main()).rejects.toThrow('Invalid usage')
	})

	it('should handle missing URL', async () => {
		process.argv = ['node', 'cli.ts', 'scrape']
		const { default: main } = await import('../../src/handlers/cli')
		await expect(main()).rejects.toThrow('Invalid usage')
	})
})
