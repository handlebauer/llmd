import { BLOCKED_DOMAINS, BLOCKED_EXTENSIONS } from './constants'
import { ValidationError } from './errors'

export function validateUrl(url: string | null, errorMessage: string): string {
	if (!url) {
		throw new ValidationError(errorMessage)
	}
	if (!/^https?:\/\/.+/.test(url)) {
		throw new ValidationError(
			'Invalid URL. Must start with http:// or https://',
		)
	}
	return url
}

export function isBlockedMedia(pathname: string): boolean {
	return BLOCKED_EXTENSIONS.some((ext: string) => pathname.endsWith(ext))
}

export function isBlockedDomain(hostname: string): boolean {
	return BLOCKED_DOMAINS.some((domain: string) => hostname.includes(domain))
}
