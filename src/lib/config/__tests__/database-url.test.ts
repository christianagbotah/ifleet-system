import { describe, expect, it } from 'vitest'

import {
  assertSafeDatabaseTarget,
  extractDatabaseName,
  resolveDatabaseUrl,
  resolvePrismaCliDatabaseUrl,
} from '@/lib/config/database-url'

const productionUrl = 'mariadb://ifleetpro_app@localhost:3306/lightworld_ifleetpro_db'
const legacyProductionUrl = 'mariadb://ifleet_app@163.245.212.15:3306/ifleetpro_data'

describe('resolveDatabaseUrl', () => {
  it('fails fast when DATABASE_URL is missing', () => {
    expect(() => resolveDatabaseUrl({}, 'development')).toThrow(/DATABASE_URL is required/i)
  })

  it('rejects malformed database URLs', () => {
    expect(() => resolveDatabaseUrl({ DATABASE_URL: 'not-a-url' }, 'development')).toThrow(/database url/i)
  })

  it('normalizes mysql URLs to mariadb URLs', () => {
    const value = resolveDatabaseUrl(
      { DATABASE_URL: 'mysql://dev@127.0.0.1:3306/ifleetpro_dev' },
      'development'
    )

    expect(value).toBe('mariadb://dev@127.0.0.1:3306/ifleetpro_dev')
  })

  it('blocks the actual production database outside production even on localhost', () => {
    expect(() => resolveDatabaseUrl({ DATABASE_URL: productionUrl }, 'development')).toThrow(
      /production database/i
    )
  })

  it('continues to block the legacy production database fingerprint', () => {
    expect(() => resolveDatabaseUrl({ DATABASE_URL: legacyProductionUrl }, 'test')).toThrow(
      /production database/i
    )
  })

  it('allows an explicit break-glass override outside production', () => {
    expect(
      resolveDatabaseUrl(
        { DATABASE_URL: productionUrl, ALLOW_PRODUCTION_DB_IN_DEV: 'true' },
        'development'
      )
    ).toBe(productionUrl)
  })

  it('accepts the configured production target in production mode', () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: productionUrl }, 'production')).toBe(productionUrl)
  })
})

describe('database URL helpers', () => {
  it('extracts the configured database name', () => {
    expect(extractDatabaseName('mariadb://dev@127.0.0.1:3306/ifleetpro_dev?ssl=false')).toBe(
      'ifleetpro_dev'
    )
  })

  it('allows a non-production database target', () => {
    expect(() =>
      assertSafeDatabaseTarget(
        'mariadb://dev@127.0.0.1:3306/ifleetpro_dev',
        'development',
        false
      )
    ).not.toThrow()
  })
})


describe('resolvePrismaCliDatabaseUrl', () => {
  it('uses Prisma MySQL URL syntax for a MariaDB app connection', () => {
    expect(
      resolvePrismaCliDatabaseUrl(
        { DATABASE_URL: 'mariadb://staging@localhost:3306/lightworld_ifleetpro_staging' },
        'development'
      )
    ).toBe('mysql://staging@localhost:3306/lightworld_ifleetpro_staging')
  })

  it('still blocks a production database target outside production', () => {
    expect(() =>
      resolvePrismaCliDatabaseUrl({ DATABASE_URL: productionUrl }, 'development')
    ).toThrow(/production database/i)
  })
})
