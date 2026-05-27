import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

// GET /api/fuel-stations/analytics — price trends, cheapest stations, brand comparisons, savings
export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const fuelType = searchParams.get('fuelType') || 'Diesel'
  const months = parseInt(searchParams.get('months') || '12')

  // 1. Price trend — monthly avg price for last N months
  const trendStart = new Date()
  trendStart.setMonth(trendStart.getMonth() - months)
  trendStart.setDate(1)
  trendStart.setHours(0, 0, 0, 0)

  const priceHistory = await db.fuelPrice.findMany({
    where: {
      fuelType,
      effectiveDate: { gte: trendStart },
    },
    orderBy: { effectiveDate: 'asc' },
    include: {
      fuelStation: { select: { id: true, name: true, brand: true } },
    },
  })

  // Group by month
  const monthlyAvg: { month: string; avgPrice: number; minPrice: number; maxPrice: number; entries: number }[] = []
  const monthlyMap = new Map<string, number[]>()

  for (const p of priceHistory) {
    const key = `${p.effectiveDate.getFullYear()}-${String(p.effectiveDate.getMonth() + 1).padStart(2, '0')}`
    if (!monthlyMap.has(key)) monthlyMap.set(key, [])
    monthlyMap.get(key)!.push(p.pricePerLiter)
  }

  const sortedKeys = Array.from(monthlyMap.keys()).sort()
  for (const key of sortedKeys) {
    const prices = monthlyMap.get(key)!
    const [year, month] = key.split('-')
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    monthlyAvg.push({
      month: `${monthNames[parseInt(month) - 1]} ${year}`,
      avgPrice: Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100,
      minPrice: Math.round(Math.min(...prices) * 100) / 100,
      maxPrice: Math.round(Math.max(...prices) * 100) / 100,
      entries: prices.length,
    })
  }

  // 2. Current prices per station (latest)
  const allLatest = await db.fuelPrice.findMany({
    where: { fuelType },
    orderBy: { effectiveDate: 'desc' },
    include: {
      fuelStation: {
        select: {
          id: true, name: true, brand: true, city: true, route: true,
          latitude: true, longitude: true, isActive: true,
        },
      },
    },
  })

  // Deduplicate by station (keep latest)
  const seen = new Set<string>()
  const latestByStation: typeof allLatest = []
  for (const p of allLatest) {
    if (!seen.has(p.stationId)) {
      seen.add(p.stationId)
      latestByStation.push(p)
    }
  }

  // Cheapest 10
  const cheapest = latestByStation
    .filter(p => p.fuelStation.isActive)
    .sort((a, b) => a.pricePerLiter - b.pricePerLiter)
    .slice(0, 10)

  // Most expensive 5
  const mostExpensive = latestByStation
    .filter(p => p.fuelStation.isActive)
    .sort((a, b) => b.pricePerLiter - a.pricePerLiter)
    .slice(0, 5)

  // 3. Brand comparison
  const brandPrices = new Map<string, number[]>()
  for (const p of latestByStation) {
    if (!p.fuelStation.isActive) continue
    if (!brandPrices.has(p.fuelStation.brand)) brandPrices.set(p.fuelStation.brand, [])
    brandPrices.get(p.fuelStation.brand)!.push(p.pricePerLiter)
  }

  const brandComparison = Array.from(brandPrices.entries()).map(([brand, prices]) => {
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length
    return {
      brand,
      avgPrice: Math.round(avg * 100) / 100,
      minPrice: Math.round(Math.min(...prices) * 100) / 100,
      maxPrice: Math.round(Math.max(...prices) * 100) / 100,
      stationCount: prices.length,
    }
  }).sort((a, b) => a.avgPrice - b.avgPrice)

  // 4. Overall summary
  const allCurrentPrices = latestByStation.filter(p => p.fuelStation.isActive).map(p => p.pricePerLiter)
  const overallAvg = allCurrentPrices.length > 0
    ? Math.round((allCurrentPrices.reduce((a, b) => a + b, 0) / allCurrentPrices.length) * 100) / 100
    : 0

  // Price change: this month vs last month
  const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const lastMonthDate = new Date()
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1)
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`

  const thisMonthPrices = monthlyMap.get(thisMonth)
  const lastMonthPrices = monthlyMap.get(lastMonth)
  const thisMonthAvg = thisMonthPrices ? thisMonthPrices.reduce((a, b) => a + b, 0) / thisMonthPrices.length : null
  const lastMonthAvg = lastMonthPrices ? lastMonthPrices.reduce((a, b) => a + b, 0) / lastMonthPrices.length : null
  const priceChange = (thisMonthAvg !== null && lastMonthAvg !== null)
    ? Math.round((thisMonthAvg - lastMonthAvg) * 100) / 100
    : null
  const priceChangePercent = (priceChange !== null && lastMonthAvg !== null && lastMonthAvg > 0)
    ? Math.round((priceChange / lastMonthAvg) * 10000) / 100
    : null

  // 5. Savings calculator data
  const cheapestPrice = cheapest.length > 0 ? cheapest[0].pricePerLiter : 0
  const activeStations = await db.fuelStation.count({ where: { isActive: true } })

  const mappedCheapest = cheapest.map((p: Record<string, unknown>) => ({
    ...p,
    station: p.fuelStation,
  }))
  const mappedMostExpensive = mostExpensive.map((p: Record<string, unknown>) => ({
    ...p,
    station: p.fuelStation,
  }))

  return NextResponse.json({
    summary: {
      overallAvg,
      cheapestPrice,
      priceChange,
      priceChangePercent,
      activeStations,
      totalPrices: allCurrentPrices.length,
    },
    trends: monthlyAvg,
    cheapest: mappedCheapest,
    mostExpensive: mappedMostExpensive,
    brandComparison,
  })
}
