const PRODUCTION_DB_NAMES = new Set(['lightworld_ifleetpro_db', 'ifleetpro_data'])

function normalizeProtocol(value: string): string {
  if (value.startsWith('mysql://')) {
    return `mariadb://${value.slice('mysql://'.length)}`
  }
  return value
}

function parseDatabaseUrl(value: string): URL {
  const normalized = normalizeProtocol(value.trim())

  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    throw new Error('Database configuration error: DATABASE_URL must be a valid database URL')
  }

  if (parsed.protocol !== 'mariadb:' || !parsed.hostname || extractDatabaseName(normalized) === '') {
    throw new Error('Database configuration error: DATABASE_URL must target a MariaDB database')
  }

  return parsed
}

export function extractDatabaseName(url: string): string {
  try {
    const parsed = new URL(normalizeProtocol(url.trim()))
    return decodeURIComponent(parsed.pathname.replace(/^\//, '').split('?')[0] ?? '')
  } catch {
    throw new Error('Database configuration error: DATABASE_URL must be a valid database URL')
  }
}

export function assertSafeDatabaseTarget(
  url: string,
  nodeEnv: string,
  allowProductionDbInDev: boolean
): void {
  const parsed = parseDatabaseUrl(url)
  const databaseName = extractDatabaseName(url)
  const isKnownProductionTarget = PRODUCTION_DB_NAMES.has(databaseName)

  if (nodeEnv !== 'production' && isKnownProductionTarget && !allowProductionDbInDev) {
    throw new Error(
      'Database configuration error: non-production runtime cannot use the production database without ALLOW_PRODUCTION_DB_IN_DEV=true'
    )
  }
}

export function resolveDatabaseUrl(env: NodeJS.ProcessEnv, nodeEnv: string): string {
  const raw = env.DATABASE_URL?.trim()
  if (!raw) {
    throw new Error('Database configuration error: DATABASE_URL is required')
  }

  const normalized = normalizeProtocol(raw)
  parseDatabaseUrl(normalized)
  assertSafeDatabaseTarget(
    normalized,
    nodeEnv,
    env.ALLOW_PRODUCTION_DB_IN_DEV?.trim().toLowerCase() === 'true'
  )

  return normalized
}

export function resolvePrismaCliDatabaseUrl(env: NodeJS.ProcessEnv, nodeEnv: string): string {
  const runtimeUrl = resolveDatabaseUrl(env, nodeEnv)
  return `mysql://${runtimeUrl.slice('mariadb://'.length)}`
}
