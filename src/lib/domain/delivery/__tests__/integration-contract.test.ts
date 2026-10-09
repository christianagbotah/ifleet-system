import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function source(relative: string) {
  const file = path.join(process.cwd(), relative)
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
}

describe('Phase 4 ePOD integration contract', () => {
  it('adds immutable POD and evidence persistence with an idempotency key', () => {
    const schema = source('prisma/models/delivery.prisma')
    expect(schema).toContain('model ProofOfDelivery {')
    expect(schema).toContain('idempotencyKey')
    expect(schema).toContain('@unique')
    expect(schema).toContain('payloadFingerprint')
    expect(schema).toContain('model ProofOfDeliveryEvidence {')
    expect(schema).toContain('proofOfDeliveryId')
    expect(schema).toContain('storageRef')
  })

  it('ships a trip-scoped POD API with driver ownership and idempotent submission', () => {
    const route = source('src/app/api/trips/[id]/proof-of-delivery/route.ts')
    expect(route).toContain('isDriverOrAdmin')
    expect(route).toContain('submitProofOfDelivery')
    expect(route).toContain('idempotencyKey')
    expect(route).toContain('deliveryStop')
    expect(route).toContain('redactProofOfDelivery')
  })

  it('guards delivered transition with server-side POD readiness', () => {
    const route = source('src/app/api/trips/[id]/transition/route.ts')
    expect(route).toContain('evaluateTripDeliveryReadiness')
    expect(route).toContain('POD_REQUIRED')
  })

  it('integrates POD capture into the existing driver trip workflow', () => {
    const driverTrip = source('src/components/driver-portal/DriverPortalTripList.tsx')
    const podForm = source('src/components/delivery/ProofOfDeliveryForm.tsx')
    expect(driverTrip).toContain('ProofOfDeliveryForm')
    expect(podForm).toContain('proof-of-delivery')
    expect(podForm).toContain('idempotencyKey')
  })
})
