import { BLOCKED_DOMAINS } from './constants'
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
	const BLOCKED_EXTENSIONS = [
		'.png',
		'.jpg',
		'.jpeg',
		'.gif',
		'.svg',
		'.mp3',
		'.mp4',
		'.avi',
		'.flac',
		'.ogg',
		'.wav',
		'.webm',
	]
	return BLOCKED_EXTENSIONS.some(ext => pathname.endsWith(ext))
}

export function isBlockedDomain(hostname: string): boolean {
	return BLOCKED_DOMAINS.some(domain => hostname.includes(domain))
}
