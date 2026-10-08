import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

function read(relativePath: string) {
  const absolute = path.join(process.cwd(), relativePath)
  expect(existsSync(absolute), `${relativePath} should exist`).toBe(true)
  return readFileSync(absolute, 'utf8')
}

describe('electronic waybill persistence and verification integration', () => {
  it('adds immutable root/version/seal persistence models', () => {
    const schema = read('prisma/models/waybill.prisma')
    expect(schema).toContain('model ElectronicWaybill')
    expect(schema).toContain('model ElectronicWaybillVersion')
    expect(schema).toContain('model WaybillSeal')
    expect(schema).toContain('verificationToken')
    expect(schema).toContain('@@unique([waybillId, version])')
  })

  it('exposes authenticated trip-scoped finalization and correction APIs using immutable domain functions', () => {
    const route = read('src/app/api/trips/[id]/waybill/route.ts')
    expect(route).toContain('export async function GET')
    expect(route).toContain('export async function POST')
    expect(route).toContain('export async function PUT')
    expect(route).toContain('requireAuth')
    expect(route).toContain('requireWriteAccess')
    expect(route).toContain('finalizeWaybill')
    expect(route).toContain('supersedeWaybill')
    expect(route).toContain("isolationLevel: 'Serializable'")
    expect(route).toContain('createAuditLog')
  })

  it('provides an exact GET-only public verification API and page', () => {
    const api = read('src/app/api/public/waybills/[token]/route.ts')
    const page = read('src/app/verify/waybill/[token]/page.tsx')
    const proxy = read('src/proxy.ts')

    expect(api).toContain('export async function GET')
    expect(api).toContain('publicWaybillVerification')
    expect(page).toContain('Waybill Verification')
    expect(proxy).toContain("'/api/public/waybills/'")
    expect(proxy).toContain('PUBLIC_GET_ONLY_ROUTES')
  })

  it('uses the immutable electronic waybill as dispatch-clearance evidence', () => {
    const service = read('src/lib/domain/dispatch/trip-clearance.ts')
    expect(service).toContain('electronicWaybill')
    expect(service).toContain('WaybillSeal')
    expect(service).not.toContain('const waybillFinalized = Boolean(trip.waybillNumber)')
  })

  it('routes PDF generation through the current finalized electronic waybill wrapper', () => {
    const wrapper = read('src/lib/reports/electronic-waybill-pdf.ts')
    const reportRoute = read('src/app/api/reports/waybill/route.ts')
    expect(wrapper).toContain('electronicWaybill')
    expect(wrapper).toContain('verificationToken')
    expect(wrapper).toContain('storedElectronicWaybillToDomain')
    expect(reportRoute).toContain('buildElectronicWaybillPdf')
  })
})
