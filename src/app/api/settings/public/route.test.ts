import { beforeEach, describe, expect, it, vi } from 'vitest'

const { findFirst } = vi.hoisted(() => ({
  findFirst: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    systemSettings: { findFirst },
  },
}))

async function loadRoute(): Promise<{ GET?: () => Promise<Response> } | null> {
  const routeModule = './' + 'route'
  try {
    return await import(/* @vite-ignore */ routeModule)
  } catch {
    return null
  }
}

describe('GET /api/settings/public', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns only the configured currency', async () => {
    findFirst.mockResolvedValue({ currency: 'USD', companyName: 'Private Fleet Co' })
    const route = await loadRoute()

    expect(route?.GET).toBeTypeOf('function')
    const response = await route!.GET!()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ currency: 'USD' })
    expect(findFirst).toHaveBeenCalledWith({ select: { currency: true } })
  })

  it('falls back to GHS without creating settings during a public read', async () => {
    findFirst.mockResolvedValue(null)
    const route = await loadRoute()

    expect(route?.GET).toBeTypeOf('function')
    const response = await route!.GET!()
    expect(await response.json()).toEqual({ currency: 'GHS' })
  })
})
