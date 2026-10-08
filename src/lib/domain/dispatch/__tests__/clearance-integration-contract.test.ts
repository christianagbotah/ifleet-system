import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

function read(relativePath: string) {
  const absolute = path.join(process.cwd(), relativePath)
  expect(existsSync(absolute), `${relativePath} should exist`).toBe(true)
  return readFileSync(absolute, 'utf8')
}

describe('dispatch clearance integration', () => {
  it('exposes authenticated trip-scoped clearance evaluation with audited privileged override support', () => {
    const source = read('src/app/api/trips/[id]/clearance/route.ts')

    expect(source).toContain('export async function GET')
    expect(source).toContain('export async function POST')
    expect(source).toContain('requireAuth')
    expect(source).toContain('requireWriteAccess')
    expect(source).toContain('evaluateTripDispatchClearance')
    expect(source).toContain('createAuditLog')
    expect(source).toContain('override')
  })

  it('guards departed_loading_point with the same trip clearance evaluator', () => {
    const transition = read('src/app/api/trips/[id]/transition/route.ts')
    const stateMachine = read('src/lib/domain/dispatch/trip-state-machine.ts')

    expect(stateMachine).toContain('requiresDispatchClearance')
    expect(transition).toContain('requiresDispatchClearance')
    expect(transition).toContain('evaluateTripDispatchClearance')
    expect(transition).toContain('DISPATCH_CLEARANCE_BLOCKED')
  })
})
