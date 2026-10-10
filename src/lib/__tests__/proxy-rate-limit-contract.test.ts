import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'src/proxy.ts'), 'utf8')

describe('proxy rate limit consolidation', () => {
  it('uses the shared rate-limit utility rather than a second limiter implementation', () => {
    expect(source).toContain("from '@/lib/rate-limit'")
    expect(source).toContain('RATE_LIMITS.api')
    expect(source).not.toContain('interface RateLimitEntry')
    expect(source).not.toContain('const rateLimitStore = new Map')
    expect(source).not.toContain('function rateLimit(')
  })
})
