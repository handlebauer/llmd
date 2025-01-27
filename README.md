# LLMD (Live Link Markdown)

A Cloudflare Worker service that converts web pages to Markdown with support for crawling and link extraction. Built with TypeScript, Bun, and Puppeteer.

## Features

- **Single Page Conversion**: Convert any webpage to clean, formatted Markdown
- **Site Crawling**: Crawl and convert multiple pages from a website
- **Link Extraction**: Extract and analyze internal links from any webpage
- **Content Cleaning**: Automatically removes ads, navigation, footers, and other non-content elements
- **Smart Navigation**: Fallback navigation strategies for dynamic pages
- **Resource Optimization**: Blocks unnecessary resources (images, ads, analytics) during scraping

## API Endpoints

- `/scrape/:url` - Convert a single webpage to Markdown
- `/crawl/:url` - Crawl a site and convert all found pages to Markdown
- `/links/:url` - Get a list of internal links from a webpage

All URLs must be properly encoded and include the protocol (http/https).

## Project Structure

```
src/
├── core/           # Core business logic
│   ├── markdown.ts # HTML to Markdown conversion
│   ├── links.ts    # Link extraction and crawling
│   └── index.ts    # Core exports
├── utils/          # Utilities and helpers
│   ├── browser.ts  # Browser setup and management
│   ├── validation.ts  # URL validation
│   ├── constants.ts  # All constants
│   └── errors.ts     # Error types
├── handlers/       # Request handlers
│   ├── worker.ts   # Cloudflare worker handler
│   └── cli.ts      # Local CLI handler
└── index.ts        # Main entry point
```

## Local Development

1. Install dependencies:

```bash
bun install
```

2. Run locally using the CLI:

```bash
# Convert a single webpage to Markdown
bun run cli scrape https://example.com

# Crawl a site and convert all found pages
bun run cli crawl https://example.com

# Get a list of internal links from a webpage
bun run cli links https://example.com
```

3. Run tests:

```bash
bun test
```

4. Deploy to Cloudflare:

```bash
bun run deploy
```

## Response Formats

### Markdown Response (`/scrape/:url`)

```
Content-Type: text/markdown
Cache-Control: public, max-age=3600

# Page Title
...converted markdown content...
```

### Crawl Response (`/crawl/:url`)

```json
[
	{
		"url": "https://example.com",
		"markdown": "# Page Title\n..."
	},
	{
		"url": "https://example.com/page2",
		"markdown": "# Another Page\n..."
	}
]
```

### Links Response (`/links/:url`)

```json
{
	"url": "https://example.com",
	"count": 42,
	"links": ["https://example.com/page1", "https://example.com/page2"]
}
```

## Error Handling

- `400 Bad Request`: Invalid URL format or missing URL
- `500 Internal Server Error`: Server-side processing errors

All error responses include a descriptive error message.

## Limitations

- Maximum of 10 pages per crawl request
- 15-second timeout for page navigation
- Only internal links are followed during crawling
- Some dynamic content may not be captured

## License

MIT
