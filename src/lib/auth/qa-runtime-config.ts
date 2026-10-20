export interface QaProfileConfig {
  key: string
  label: string
  email: string
  roleName: string
  description: string | null
  capability: string | null
  position: string | null
  department: string | null
  driverId: string | null
  order: number
}

export interface PublicQaProfile {
  key: string
  label: string
  role: string
  description: string | null
  capability: string | null
  position: string | null
  department: string | null
  order: number
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i
const ALLOWED_KEYS = new Set([
  'key',
  'label',
  'email',
  'roleName',
  'description',
  'capability',
  'position',
  'department',
  'driverId',
  'order',
])
const FORBIDDEN_KEYS = new Set([
  'password',
  'secret',
  'token',
  'apikey',
  'api_key',
  'credential',
])

function requireString(record: Record<string, unknown>, key: string, index: number): string {
  const value = record[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`QA_PROFILES_JSON profile ${index + 1} requires a non-empty ${key}.`)
  }
  return value.trim()
}

function optionalString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  if (value == null || value === '') return null
  if (typeof value !== 'string') {
    throw new Error(`QA_PROFILES_JSON field ${key} must be a string when supplied.`)
  }
  return value.trim() || null
}

export function parseQaProfilesConfig(raw: string | undefined): QaProfileConfig[] {
  if (!raw?.trim()) {
    throw new Error('QA_PROFILES_JSON must be configured when QA login is enabled.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('QA_PROFILES_JSON must contain valid JSON.')
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('QA_PROFILES_JSON must contain at least one QA profile.')
  }

  const seenKeys = new Set<string>()
  const seenEmails = new Set<string>()

  const profiles = parsed.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`QA_PROFILES_JSON profile ${index + 1} must be an object.`)
    }

    const record = entry as Record<string, unknown>
    for (const key of Object.keys(record)) {
      if (FORBIDDEN_KEYS.has(key) || FORBIDDEN_KEYS.has(key.toLowerCase())) {
        throw new Error(`QA_PROFILES_JSON must not contain credential field ${key}.`)
      }
      if (!ALLOWED_KEYS.has(key)) {
        throw new Error(`QA_PROFILES_JSON contains unsupported field ${key}.`)
      }
    }

    const key = requireString(record, 'key', index)
    if (!KEY_PATTERN.test(key)) {
      throw new Error(`QA_PROFILES_JSON profile key ${key} has an invalid format.`)
    }
    const normalizedKey = key.toLowerCase()
    if (seenKeys.has(normalizedKey)) {
      throw new Error(`QA_PROFILES_JSON contains duplicate profile key ${key}.`)
    }
    seenKeys.add(normalizedKey)

    const email = requireString(record, 'email', index).toLowerCase()
    if (!email.includes('@')) {
      throw new Error(`QA_PROFILES_JSON profile ${key} requires a valid email.`)
    }
    if (seenEmails.has(email)) {
      throw new Error(`QA_PROFILES_JSON contains duplicate email ${email}.`)
    }
    seenEmails.add(email)

    const orderValue = record.order
    if (orderValue != null && (!Number.isInteger(orderValue) || Number(orderValue) < 0)) {
      throw new Error('QA_PROFILES_JSON order must be a non-negative integer when supplied.')
    }

    return {
      key,
      label: requireString(record, 'label', index),
      email,
      roleName: requireString(record, 'roleName', index),
      description: optionalString(record, 'description'),
      capability: optionalString(record, 'capability'),
      position: optionalString(record, 'position'),
      department: optionalString(record, 'department'),
      driverId: optionalString(record, 'driverId'),
      order: orderValue == null ? index : Number(orderValue),
    }
  })

  return profiles.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
}

export function toPublicQaProfile(profile: QaProfileConfig): PublicQaProfile {
  return {
    key: profile.key,
    label: profile.label,
    role: profile.roleName,
    description: profile.description,
    capability: profile.capability,
    position: profile.position,
    department: profile.department,
    order: profile.order,
  }
}

export function findQaProfile(profiles: QaProfileConfig[], key: unknown): QaProfileConfig | null {
  if (typeof key !== 'string' || key.trim() === '') return null
  const normalized = key.trim().toLowerCase()
  return profiles.find((profile) => profile.key.toLowerCase() === normalized) ?? null
}
