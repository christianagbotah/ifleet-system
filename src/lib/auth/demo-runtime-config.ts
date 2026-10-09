export interface DemoProfileConfig {
  key: string
  label: string
  name: string
  roleName: string
  description: string | null
  capability: string | null
  position: string | null
  department: string | null
  order: number
}

export interface PublicDemoProfile {
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
  'name',
  'roleName',
  'description',
  'capability',
  'position',
  'department',
  'order',
])
const FORBIDDEN_KEYS = new Set([
  'password',
  'email',
  'secret',
  'token',
  'apikey',
  'api_key',
  'employeeNumber',
  'phone',
])

function requireString(record: Record<string, unknown>, key: string, index: number): string {
  const value = record[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`DEMO_PROFILES_JSON profile ${index + 1} requires a non-empty ${key}.`)
  }
  return value.trim()
}

function optionalString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  if (value == null || value === '') return null
  if (typeof value !== 'string') {
    throw new Error(`DEMO_PROFILES_JSON field ${key} must be a string when supplied.`)
  }
  return value.trim() || null
}

export function parseDemoProfilesConfig(raw: string | undefined): DemoProfileConfig[] {
  if (!raw?.trim()) {
    throw new Error('DEMO_PROFILES_JSON must be configured when public demo access is enabled.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('DEMO_PROFILES_JSON must contain valid JSON.')
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('DEMO_PROFILES_JSON must contain at least one demo profile.')
  }

  const seen = new Set<string>()
  const profiles = parsed.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`DEMO_PROFILES_JSON profile ${index + 1} must be an object.`)
    }

    const record = entry as Record<string, unknown>
    for (const key of Object.keys(record)) {
      if (FORBIDDEN_KEYS.has(key) || FORBIDDEN_KEYS.has(key.toLowerCase())) {
        throw new Error(`DEMO_PROFILES_JSON must not contain credential field ${key}.`)
      }
      if (!ALLOWED_KEYS.has(key)) {
        throw new Error(`DEMO_PROFILES_JSON contains unsupported field ${key}.`)
      }
    }

    const key = requireString(record, 'key', index)
    if (!KEY_PATTERN.test(key)) {
      throw new Error(`DEMO_PROFILES_JSON profile key ${key} has an invalid format.`)
    }
    const normalizedKey = key.toLowerCase()
    if (seen.has(normalizedKey)) {
      throw new Error(`DEMO_PROFILES_JSON contains duplicate profile key ${key}.`)
    }
    seen.add(normalizedKey)

    const orderValue = record.order
    if (orderValue != null && (!Number.isInteger(orderValue) || Number(orderValue) < 0)) {
      throw new Error('DEMO_PROFILES_JSON order must be a non-negative integer when supplied.')
    }

    return {
      key,
      label: requireString(record, 'label', index),
      name: requireString(record, 'name', index),
      roleName: requireString(record, 'roleName', index),
      description: optionalString(record, 'description'),
      capability: optionalString(record, 'capability'),
      position: optionalString(record, 'position'),
      department: optionalString(record, 'department'),
      order: orderValue == null ? index : Number(orderValue),
    }
  })

  return profiles.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
}

export function toPublicDemoProfile(profile: DemoProfileConfig): PublicDemoProfile {
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

export function findDemoProfile(profiles: DemoProfileConfig[], key: unknown): DemoProfileConfig | null {
  if (typeof key !== 'string' || key.trim() === '') return null
  const normalized = key.trim().toLowerCase()
  return profiles.find((profile) => profile.key.toLowerCase() === normalized) ?? null
}
