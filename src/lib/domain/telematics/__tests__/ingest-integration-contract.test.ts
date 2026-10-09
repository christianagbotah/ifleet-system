import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const source = (path: string) => readFileSync(join(root, path), 'utf8')

describe('durable telematics ingestion integration contract', () => {
  it('machine ingestion verifies HMAC before using the common ingest service', () => {
    const route = source('src/app/api/telematics/ingest/[provider]/route.ts')
    expect(route).toContain('verifyMachineRequest')
    expect(route).toContain('FilesystemNonceStore')
    expect(route).toContain('ingestTelematicsEvent')
    expect(route.indexOf('const auth = await verifyMachineRequest')).toBeLessThan(route.indexOf('const result = await ingestTelematicsEvent'))
  })

  it('accepts hardware-facing device references without requiring an internal database id', () => {
    const route = source('src/app/api/telematics/ingest/[provider]/route.ts')
    expect(route).toContain('payload.imei')
    expect(route).toContain('payload.serialNumber')
    expect(route).toContain('payload.deviceRef')
  })

  it('phone HTTP fallback uses the same normalized durable ingest service', () => {
    const route = source('src/app/api/tracking/location/route.ts')
    expect(route).toContain('MobileAppTelematicsProvider')
    expect(route).toContain('ingestTelematicsEvent')
    expect(route).toContain('authoritativeAsset')
  })

  it('socket phone tracking authenticates and persists before broadcasting', () => {
    const sender = source('src/components/tracking/DriverLocationSender.tsx')
    const service = source('mini-services/tracking-service/index.ts')
    expect(sender).toContain('auth: { token')
    expect(service).toContain("socket.on('location-update'")
    expect(service).toContain('/api/tracking/location')
    expect(service).toContain('socket.handshake.auth')
    expect(service.indexOf('/api/tracking/location')).toBeLessThan(service.indexOf("socket.broadcast.emit('location:updated'"))
  })

  it('live tracking viewers authenticate and retain the legacy truck-location event contract', () => {
    const view = source('src/components/tracking/LiveTrackingView.tsx')
    const service = source('mini-services/tracking-service/index.ts')
    expect(view).toContain('auth: { token')
    expect(service).toContain("'truck-location'")
    expect(service).toContain("socket.on('join-all-trucks'")
  })

  it('socket hydration can read durable locations instead of memory only', () => {
    const service = source('mini-services/tracking-service/index.ts')
    expect(service).toContain("socket.on('get:all-locations'")
    expect(service).toContain("method: 'GET'")
    expect(service).toContain('/api/tracking/location')
  })
})
