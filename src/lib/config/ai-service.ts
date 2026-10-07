export type AiServiceConfig = {
  url: string
  internalApiKey: string
}

export function getAiServiceConfig(env: NodeJS.ProcessEnv = process.env): AiServiceConfig {
  const rawUrl = env.AI_SERVICE_URL?.trim()
  if (!rawUrl) {
    throw new Error("AI_SERVICE_URL is required for AI service communication")
  }

  const internalApiKey = env.INTERNAL_API_KEY?.trim()
  if (!internalApiKey) {
    throw new Error("INTERNAL_API_KEY is required for AI service communication")
  }

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error("AI_SERVICE_URL must be a valid absolute URL")
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("AI_SERVICE_URL must use http or https")
  }

  return {
    url: rawUrl.replace(/\/+$/, ""),
    internalApiKey,
  }
}
