import { describe, expect, it } from 'vitest'

import {
  assertSafeDatabaseTarget,
  extractDatabaseName,
  resolveDatabaseUrl,
} from '@/lib/config/database-url'

const productionUrl = 'mariadb://ifleet_app@163.245.212.15:3306/ifleetpro_data'

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

  it('blocks the known production database target outside production', () => {
    expect(() => resolveDatabaseUrl({ DATABASE_URL: productionUrl }, 'development')).toThrow(
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

  it('blocks only when the target matches the production fingerprint', () => {
    expect(() =>
      assertSafeDatabaseTarget(
        'mariadb://dev@127.0.0.1:3306/ifleetpro_dev',
        'development',
        false
      )
    ).not.toThrow()
  })
})
