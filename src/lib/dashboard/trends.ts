export function calculatePercentageTrend(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
  if (previous === 0) return null

  return Math.round(((current - previous) / Math.abs(previous)) * 100)
}

export function selectLatestMonthlyPeriods<T extends { year: number; monthIndex: number }>(periods: T[]): { current: T; previous: T } | null {
  if (periods.length < 2) return null

  const sorted = [...periods].sort((a, b) => {
    const aKey = a.year * 12 + a.monthIndex
    const bKey = b.year * 12 + b.monthIndex
    return bKey - aKey
  })

  return { current: sorted[0], previous: sorted[1] }
}
