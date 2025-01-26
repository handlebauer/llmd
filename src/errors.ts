export class ValidationError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'ValidationError'
	}
}

export class ProcessingError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'ProcessingError'
	}
}
