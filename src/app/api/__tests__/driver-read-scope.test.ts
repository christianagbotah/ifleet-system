// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: {
    userId: 'driver-user', email: '', roleName: 'Driver', permissions: [],
    driverId: null as string | null, isDemo: false, demoProfile: null,
  },
  trip: { findMany: vi.fn(), count: vi.fn() },
  driverWallet: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
  driverSettlement: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
  invoice: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
}))

vi.mock('@/lib/auth-server', () => ({
  requireAuth: () => mocks.auth,
  requireWriteAccess: () => true,
  ROLES: { ADMIN: 'Admin', MANAGER: 'Manager', DRIVER: 'Driver' },
}))
vi.mock('@/lib/db', () => ({ db: mocks }))
vi.mock('@/lib/services/notification-dispatcher', () => ({ dispatchNotification: vi.fn() }))
vi.mock('@/lib/services/invoice-generator', () => ({ generateInvoiceForTrip: vi.fn() }))
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn(), getClientIp: vi.fn() }))

import { GET as trips } from '../trips/route'
import { GET as wallets } from '../driver-wallets/route'
import { GET as settlements } from '../settlements/route'
import { GET as invoices } from '../invoices/route'

const routes = [
  { path: 'trips', handler: trips, model: mocks.trip },
  { path: 'driver-wallets', handler: wallets, model: mocks.driverWallet },
  { path: 'settlements', handler: settlements, model: mocks.driverSettlement },
  { path: 'invoices', handler: invoices, model: mocks.invoice },
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.roleName = 'Driver'
  mocks.auth.driverId = null
  for (const route of routes) {
    route.model.findMany.mockResolvedValue([])
    route.model.count.mockResolvedValue(0)
  }
  mocks.invoice.aggregate.mockResolvedValue({ _sum: { totalAmount: 0, paidAmount: 0 } })
  mocks.driverWallet.aggregate.mockResolvedValue({ _sum: {} })
  mocks.driverSettlement.aggregate.mockResolvedValue({ _count: 0, _sum: {}, _avg: {} })
})

describe.each(routes)('driver scope: /api/$path', ({ path, handler, model }) => {
  it('rejects an unlinked driver before querying fleet records', async () => {
    const response = await handler(new NextRequest(`https://ifleetpro.example/api/${path}?driverId=someone-else`))

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/driver profile.*not linked/i) })
    expect(model.findMany).not.toHaveBeenCalled()
    expect(model.count).not.toHaveBeenCalled()
  })

  it('binds a linked driver to their own records despite a supplied driver filter', async () => {
    mocks.auth.driverId = 'own-driver'
    const response = await handler(new NextRequest(`https://ifleetpro.example/api/${path}?driverId=someone-else`))

    expect(response.status).toBe(200)
    const where = path === 'invoices' ? { trip: { driverId: 'own-driver' } } : { driverId: 'own-driver' }
    expect(model.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining(where) }))
    expect(model.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining(where) }))
  })

  it('continues to allow staff accounts without a driver profile', async () => {
    mocks.auth.roleName = 'Admin'
    const response = await handler(new NextRequest(`https://ifleetpro.example/api/${path}`))
    expect(response.status).toBe(200)
  })
})

it('returns only the linked driver revenue in the invoice summary', async () => {
  mocks.auth.driverId = 'own-driver'
  mocks.invoice.aggregate.mockImplementation(async (query: { where?: { status?: unknown; trip?: { driverId?: string } } }) => ({
    _sum: {
      totalAmount: 0,
      paidAmount: query.where?.status === 'paid'
        ? (query.where.trip?.driverId === 'own-driver' ? 30 : 9030)
        : 0,
    },
  }))

  const response = await invoices(new NextRequest('https://ifleetpro.example/api/invoices'))
  expect(response.status).toBe(200)
  expect((await response.json()).summary.thisMonthRevenue).toBe(30)
})
