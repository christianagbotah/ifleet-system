import { describe, expect, it } from 'vitest'

import { trailerCreateSchema, trailerUpdateSchema } from '@/lib/domain/fleet-assets/trailer'

describe('trailer schemas', () => {
  it('normalizes a valid trailer create payload', () => {
    const result = trailerCreateSchema.safeParse({
      plateNumber: ' gt 1234-26 ',
      trailerType: 'semi-trailer',
      bodyType: 'flatbed',
      axleCount: '3',
      tareWeight: '7200',
      maxPayload: '36000',
      status: 'active',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.plateNumber).toBe('GT 1234-26')
    expect(result.data.axleCount).toBe(3)
    expect(result.data.maxPayload).toBe(36000)
  })

  it('rejects invalid axle and payload values', () => {
    const result = trailerCreateSchema.safeParse({
      plateNumber: 'GT 1234-26',
      trailerType: 'semi-trailer',
      axleCount: 0,
      tareWeight: -1,
      maxPayload: 0,
    })

    expect(result.success).toBe(false)
  })

  it('allows partial trailer updates without requiring registration fields', () => {
    const result = trailerUpdateSchema.safeParse({ status: 'maintenance', notes: 'Brake service' })
    expect(result.success).toBe(true)
  })
})
