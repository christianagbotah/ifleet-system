import { describe, expect, it } from 'vitest'
import { calculatePercentageTrend, selectLatestMonthlyPeriods } from '../trends'

describe('dashboard trend calculations', () => {
  it('calculates a normal percentage change from a non-zero baseline', () => {
    expect(calculatePercentageTrend(125, 100)).toBe(25)
    expect(calculatePercentageTrend(75, 100)).toBe(-25)
  })

  it('does not invent a 100% trend when the previous period is zero', () => {
    expect(calculatePercentageTrend(100, 0)).toBeNull()
  })

  it('treats a zero baseline as unavailable even when both periods are zero', () => {
    expect(calculatePercentageTrend(0, 0)).toBeNull()
  })

  it('selects January after December across a year boundary', () => {
    const december = { year: 2025, monthIndex: 12, revenue: 90 }
    const january = { year: 2026, monthIndex: 1, revenue: 120 }
    const november = { year: 2025, monthIndex: 11, revenue: 80 }

    expect(selectLatestMonthlyPeriods([december, january, november])).toEqual({
      current: january,
      previous: december,
    })
  })
})
