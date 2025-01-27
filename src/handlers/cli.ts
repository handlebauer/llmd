import { crawlSite, extractInternalLinks, processPuppeteerPage } from '../core'
import {
	initializeLocalBrowser,
	navigateWithFallback,
	setupPuppeteerPageInterception,
} from '../utils/browser'
import { validateUrl } from '../utils/validation'

function printUsage() {
	console.log('Usage: bun run cli [action] [url]')
	console.log('\nActions:')
	console.log('  scrape  - Convert a single webpage to Markdown')
	console.log('  crawl   - Crawl a site and convert all found pages')
	console.log('  links   - Get a list of internal links from a webpage')
	console.log('\nExample:')
	console.log('  bun run cli scrape https://example.com')
	throw new Error('Invalid usage')
}

// Main function
export default async function main() {
	const [action, url] = process.argv.slice(2)

	if (!action || !url) {
		printUsage()
	}

	if (!['scrape', 'crawl', 'links'].includes(action)) {
		console.error('Error: Invalid action. Use scrape, crawl, or links')
		printUsage()
	}

	const validatedUrl = validateUrl(url, 'Please provide a valid URL')
	const { browser, page } = await initializeLocalBrowser()

	try {
		await setupPuppeteerPageInterception(page)
		await navigateWithFallback(page, validatedUrl)

		switch (action) {
			case 'scrape': {
				const markdown = await processPuppeteerPage(page)
				console.log('\nConverted Markdown:')
				console.log('----------------------------------------')
				console.log(markdown)
				console.log('----------------------------------------')
				break
			}

			case 'crawl': {
				const results = await crawlSite(
					page,
					validatedUrl,
					10,
					processPuppeteerPage,
				)
				console.log('\nCrawl Results:')
				console.log('----------------------------------------')
				console.log(JSON.stringify(results, null, 2))
				console.log('----------------------------------------')
				break
			}

			case 'links': {
				const links = await extractInternalLinks(page, validatedUrl)
				console.log('\nExtracted Links:')
				console.log('----------------------------------------')
				console.log(
					JSON.stringify(
						{ url: validatedUrl, count: links.length, links },
						null,
						2,
					),
				)
				console.log('----------------------------------------')
				break
			}
		}
	} catch (error) {
		console.error(
			'[ERROR]',
			error instanceof Error ? error.message : 'Unknown error',
		)
		throw error
	} finally {
		await browser.close()
	}
}

// Only run if this is the main module
// @ts-ignore - Bun-specific property
if (import.meta.main) {
	main().catch(() => process.exit(1))
}
