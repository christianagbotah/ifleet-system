const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const TTL_PATTERN = /^[1-9]\d*(?:s|m|h|d)$/i

export function isDemoRequestAllowed(method: string): boolean {
  return READ_ONLY_METHODS.has(method.trim().toUpperCase())
}

export function resolveDemoSessionTtl(value: string | undefined): string {
  const normalized = value?.trim()
  if (!normalized || !TTL_PATTERN.test(normalized)) {
    throw new Error('DEMO_SESSION_TTL must be configured as a positive duration such as 90m or 2h.')
  }
  return normalized
}
