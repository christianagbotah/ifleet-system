const internalApiKey = process.env.INTERNAL_API_KEY?.trim()

if (!internalApiKey) {
  throw new Error('[AI Service] INTERNAL_API_KEY is required; refusing to start without service authentication')
}

await import('./index')
