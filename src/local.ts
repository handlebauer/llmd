import puppeteer from 'puppeteer'

import {
	navigateWithFallback,
	processPuppeteerPage,
	setupPuppeteerPageInterception,
} from './shared'
import { validateUrl } from './utils'

// Browser management
async function initializeBrowser() {
	const browser = await puppeteer.launch()
	const page = await browser.newPage()
	console.log('[DEBUG] Browser initialized and page created')
	return { browser, page }
}

// Main function
async function main() {
	const url = validateUrl(
		process.argv[2],
		'Please provide a URL as a command line argument',
	)

	const { browser, page } = await initializeBrowser()

	try {
		await setupPuppeteerPageInterception(page)
		await navigateWithFallback(page, url)
		const markdown = await processPuppeteerPage(page)
		console.log('\nConverted Markdown:')
		console.log('----------------------------------------')
		console.log(markdown)
		console.log('----------------------------------------')
	} catch (error) {
		console.error(
			'[ERROR]',
			error instanceof Error ? error.message : 'Unknown error',
		)
		process.exit(1)
	} finally {
		await browser.close()
	}
}

// Run the script
main()
