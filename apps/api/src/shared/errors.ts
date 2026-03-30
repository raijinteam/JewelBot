export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode = 500,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class InsufficientCreditsError extends AppError {
  constructor() {
    super('Insufficient credits', 'INSUFFICIENT_CREDITS', 402)
  }
}

export class ImageAnalysisError extends AppError {
  constructor(detail?: string) {
    super(detail ?? 'Failed to analyze image', 'IMAGE_ANALYSIS_FAILED', 422)
  }
}

export class ImageGenerationError extends AppError {
  constructor(detail?: string) {
    super(detail ?? 'Image generation failed', 'IMAGE_GENERATION_FAILED', 500)
  }
}
