export function getDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const databaseUrl = env.DATABASE_URL?.trim()
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required")
  }

  if (databaseUrl.startsWith("mysql://")) {
    return `mariadb://${databaseUrl.slice("mysql://".length)}`
  }

  return databaseUrl
}
