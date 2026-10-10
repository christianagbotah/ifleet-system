export type IntegrationConnectionInput = {
  name?: unknown
  provider?: unknown
  type?: unknown
  config?: unknown
  secretRef?: unknown
}

export type IntegrationConnectionValue = {
  name: string
  provider: string
  type: string
  config: Record<string, unknown>
  secretRef: string | null
}

export type ValidationResult =
  | { success: true; value: IntegrationConnectionValue; errors: [] }
  | { success: false; errors: string[] }

const SECRET_KEY_PATTERN = /(password|secret|token|api[_-]?key|authorization|credential)/i
const SAFE_SECRET_REF_PATTERN = /^(env|vault|secret|file):\/\/[A-Za-z0-9_./:@-]+$/
const SLUG_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/

function asRequiredString(value: unknown, label: string, errors: string[]): string {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${label} is required.`)
    return ''
  }
  return value.trim()
}

function containsSecretField(value: unknown, path = 'config'): string | null {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = containsSecretField(value[index], `${path}[${index}]`)
      if (nested) return nested
    }
    return null
  }

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) return `${path}.${key}`
    const nested = containsSecretField(nestedValue, `${path}.${key}`)
    if (nested) return nested
  }
  return null
}

export function validateIntegrationConnection(input: IntegrationConnectionInput): ValidationResult {
  const errors: string[] = []
  const name = asRequiredString(input.name, 'Name', errors)
  const providerRaw = asRequiredString(input.provider, 'Provider', errors).toLowerCase()
  const typeRaw = asRequiredString(input.type, 'Type', errors).toLowerCase()

  if (providerRaw && !SLUG_PATTERN.test(providerRaw)) errors.push('Provider has an invalid format.')
  if (typeRaw && !SLUG_PATTERN.test(typeRaw)) errors.push('Type has an invalid format.')

  let config: Record<string, unknown> = {}
  if (input.config != null) {
    if (typeof input.config !== 'object' || Array.isArray(input.config)) {
      errors.push('Config must be an object.')
    } else {
      config = input.config as Record<string, unknown>
      const secretPath = containsSecretField(config)
      if (secretPath) errors.push(`Raw secret or credential field is not allowed in persisted config (${secretPath}).`)
    }
  }

  let secretRef: string | null = null
  if (input.secretRef != null && input.secretRef !== '') {
    if (typeof input.secretRef !== 'string' || !SAFE_SECRET_REF_PATTERN.test(input.secretRef.trim())) {
      errors.push('secretRef must use a server-side reference such as env://NAME or vault://path.')
    } else {
      secretRef = input.secretRef.trim()
    }
  }

  if (errors.length > 0) return { success: false, errors }
  return {
    success: true,
    errors: [],
    value: { name, provider: providerRaw, type: typeRaw, config, secretRef },
  }
}
