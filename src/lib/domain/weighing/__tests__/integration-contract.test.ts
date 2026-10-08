import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

function read(relativePath: string) {
  const absolute = path.join(process.cwd(), relativePath)
  expect(existsSync(absolute), `${relativePath} should exist`).toBe(true)
  return readFileSync(absolute, 'utf8')
}

describe('weighing persistence and UI integration', () => {
  it('adds additive weighing history models without replacing legacy WeightVerification', () => {
    const weighingSchema = read('prisma/weighing.prisma')
    const legacySchema = read('prisma/schema.prisma')

    expect(weighingSchema).toContain('model WeighingEvent')
    expect(weighingSchema).toContain('model AxleReading')
    expect(weighingSchema).toContain('legacyWeightVerificationId')
    expect(weighingSchema).toContain('supersedesEventId')
    expect(weighingSchema).toContain('clearancePassed')
    expect(legacySchema).toContain('model WeightVerification')
  })

  it('exposes authenticated trip-scoped weighing read/write API with server-side clearance', () => {
    const source = read('src/app/api/trips/[id]/weighings/route.ts')

    expect(source).toContain('export async function GET')
    expect(source).toContain('export async function POST')
    expect(source).toContain('requireAuth')
    expect(source).toContain('requireWriteAccess')
    expect(source).toContain('evaluateWeightClearance')
    expect(source).toContain('db.weighingEvent.create')
    expect(source).toContain('exception_hold')
  })

  it('mounts a weighing panel in Factory Operations for the selected trip', () => {
    const panel = read('src/components/factory-ops/WeighingPanel.tsx')
    const factory = read('src/components/factory-ops/FactoryOperationsView.tsx')

    expect(panel).toContain('export function WeighingPanel')
    expect(panel).toContain('/weighings')
    expect(panel).toContain('Axle')
    expect(factory).toContain("import { WeighingPanel }")
    expect(factory).toContain('<WeighingPanel tripId={tripId}')
  })
})
