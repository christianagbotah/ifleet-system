import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('AuditLog schema', () => {
  it('stores details in a text column so structured audit evidence is not truncated', () => {
    const schema = readFileSync(path.join(process.cwd(), 'prisma/schema.prisma'), 'utf8')
    const model = schema.match(/model AuditLog \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(model).toMatch(/details\s+String\?\s+@db\.Text/)
  })
})
