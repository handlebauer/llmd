import type { Page as CloudflarePage } from '@cloudflare/puppeteer'
import type { Page as PuppeteerPage } from 'puppeteer'

// Shared interface that defines only the methods we need from both page types
export interface Page {
	setRequestInterception(value: boolean): Promise<void>
	on(
		event: 'request',
		callback: (request: {
			url(): string
			abort(): void
			continue(): void
		}) => void,
	): void
	goto(
		url: string,
		options?: { timeout?: number; waitUntil?: 'load' | 'networkidle0' },
	): Promise<any>
	url(): string
	evaluate<T>(fn: string | ((arg: any) => T), ...args: any[]): Promise<T>
	close(): Promise<void>
}

// Type guard to check if a page is a CloudflarePage
export function isCloudFlarePage(page: any): page is CloudflarePage {
	return (
		typeof page === 'object' &&
		page !== null &&
		'browser' in page &&
		'_client' in page
	)
}

// Type guard to check if a page is a PuppeteerPage
export function isPuppeteerPage(page: any): page is PuppeteerPage {
	return (
		typeof page === 'object' &&
		page !== null &&
		'browser' in page &&
		'_frameManager' in page
	)
}