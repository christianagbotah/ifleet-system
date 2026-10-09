export interface DemoAccountSource {
  id: string
  name: string
  email?: string | null
  password?: string | null
  demoLabel?: string | null
  demoOrder?: number | null
  position?: string | null
  department?: string | null
  role: { name: string }
}

export interface PublicDemoAccount {
  id: string
  name: string
  label: string
  order: number
  position: string | null
  department: string | null
  role: string
}

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const TTL_PATTERN = /^\d+(?:s|m|h|d)$/i

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

export function toPublicDemoAccount(source: DemoAccountSource): PublicDemoAccount {
  return {
    id: source.id,
    name: source.name,
    label: source.demoLabel?.trim() || source.role.name,
    order: source.demoOrder ?? 0,
    position: source.position ?? null,
    department: source.department ?? null,
    role: source.role.name,
  }
}
