import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dashboardView = readFileSync('src/components/dashboard/DashboardView.tsx', 'utf8')
const dashboardRoute = readFileSync('src/app/api/dashboard/route.ts', 'utf8')
const analyticsView = readFileSync('src/components/analytics/AnalyticsView.tsx', 'utf8')
const costAnalyticsView = readFileSync('src/components/analytics/CostAnalyticsView.tsx', 'utf8')
const apiTypes = readFileSync('src/lib/api.ts', 'utf8')

describe('trend readiness integration contract', () => {
  it('uses the shared honest percentage-trend helper in dashboard UI and API', () => {
    expect(dashboardView).toContain('calculatePercentageTrend')
    expect(dashboardRoute).toContain('calculatePercentageTrend')
    expect(dashboardRoute).toContain('const totalRevenuePeriod = Number(currentRangeRevenue._sum.totalRevenue || 0)')
    expect(dashboardRoute).toContain('const prevRevenuePeriod = Number(prevRangeRevenue._sum.totalRevenue || 0)')
    expect(dashboardView).not.toMatch(/>\s*0\s*\?\s*100\s*:\s*0/)
    expect(dashboardRoute).not.toMatch(/>\s*0\s*\?\s*100\s*:\s*0/)
  })

  it('allows unavailable trend values to remain unavailable through analytics rendering', () => {
    expect(apiTypes).toMatch(/revenueTrend:\s*number\s*\|\s*null/)
    expect(apiTypes).toMatch(/tripsTrend:\s*number\s*\|\s*null/)
    expect(apiTypes).toMatch(/avgRevenueTrend:\s*number\s*\|\s*null/)
    expect(analyticsView).toContain('trend={data?.kpis?.revenueTrend}')
    expect(analyticsView).toContain('trend={data?.kpis?.tripsTrend}')
    expect(analyticsView).toContain('trend={data?.kpis?.avgRevenueTrend}')
  })

  it('uses neutral context instead of fake zero-percent trends for operational facts', () => {
    expect(dashboardView).toContain('context={`${data?.activeTrucks ?? 0} of ${data?.totalTrucks ?? 0} fleet active`}')
    expect(dashboardView).toContain('context="in progress"')
    expect(dashboardView).toContain('context={`${(data?.monthlyFuelLiters || 0).toLocaleString()} L this month`}')
    expect(dashboardView).not.toContain('change={0}')
    expect(analyticsView).not.toContain('trend={0}')
  })

  it('labels the fuel percentage as a month-over-month trend and keeps fill-ups as context', () => {
    const fuelCard = dashboardView.slice(
      dashboardView.indexOf('title="Fuel Cost"'),
      dashboardView.indexOf('title="Avg Cost/Liter"'),
    )

    expect(fuelCard).toContain('change={kpiTrends.fuelTrend}')
    expect(fuelCard).toContain('changeLabel="vs last month"')
    expect(fuelCard).toContain('context={`${data?.monthlyFuelEntries || 0} fill-ups`}')
  })

  it('does not invent a zero-percent trend for the categorical most-efficient-truck KPI', () => {
    const efficientTruckCard = costAnalyticsView.slice(
      costAnalyticsView.indexOf('title="Most Efficient Truck"'),
      costAnalyticsView.indexOf('      </div>', costAnalyticsView.indexOf('title="Most Efficient Truck"')),
    )

    expect(efficientTruckCard).not.toContain('trend={0}')
  })
})
