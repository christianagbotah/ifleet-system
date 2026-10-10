import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'src/app/api/auth/login/route.ts'), 'utf8')

describe('login abuse protection contract', () => {
  it('uses separate request and failed-credential buckets', () => {
    expect(source).toContain('RATE_LIMITS.loginRequest')
    expect(source).toContain('RATE_LIMITS.loginFailure')
    expect(source).toContain('getRateLimitStatus')
  })

  it('records failed credentials but resets the failure bucket after successful authentication', () => {
    expect(source).toContain('rateLimit(failureKey, RATE_LIMITS.loginFailure)')
    expect(source).toContain('resetRateLimit(failureKey)')
  })

  it('normalizes account identity and routes credential failures through one generic response', () => {
    expect(source).toContain('email.trim().toLowerCase()')
    expect(source).toContain("NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })")
    expect(source).toMatch(/if \(!user\) \{\s*return recordCredentialFailure\(\)/s)
    expect(source).toMatch(/if \(!user\.password\) \{\s*return recordCredentialFailure\(\)/s)
    expect(source).toMatch(/if \(!isPasswordValid\) \{\s*return recordCredentialFailure\(\)/s)
  })
})
