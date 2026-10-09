import { db } from '@/lib/db'
import { buildTripFinancialFacts } from '@/lib/domain/billing/trip-financial-facts'
import {
  calculateMaintenanceAllocation,
  calculateTripProfitability,
  resolveConfirmedRevenue,
} from '@/lib/domain/billing/trip-profitability'

export interface ProfitabilityQuery {
  period?: string
  dateFrom?: string
  dateTo?: string
  truckId?: string
  driverId?: string
  route?: string
  clientId?: string
  page?: number
  limit?: number
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function dateRange(input: ProfitabilityQuery): { startDate: Date; endDate: Date } {
  const now = new Date()
  if (input.dateFrom && input.dateTo) {
    const startDate = new Date(input.dateFrom)
    const endDate = new Date(input.dateTo)
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) throw new Error('Invalid profitability date range')
    endDate.setHours(23, 59, 59, 999)
    return { startDate, endDate }
  }

  switch (input.period ?? 'this_month') {
    case 'last_month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      return {
        startDate: new Date(first.getFullYear(), first.getMonth() - 1, 1),
        endDate: new Date(first.getFullYear(), first.getMonth(), 0, 23, 59, 59, 999),
      }
    }
    case 'this_quarter': {
      const month = Math.floor(now.getMonth() / 3) * 3
      return {
        startDate: new Date(now.getFullYear(), month, 1),
        endDate: new Date(now.getFullYear(), month + 3, 0, 23, 59, 59, 999),
      }
    }
    case 'this_year':
      return {
        startDate: new Date(now.getFullYear(), 0, 1),
        endDate: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
      }
    default:
      return {
        startDate: new Date(now.getFullYear(), now.getMonth(), 1),
        endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
      }
  }
}

function aggregate<T extends { revenue: number; totalCost: number; netProfit: number }>(
  rows: T[],
  keyOf: (row: T) => string,
) {
  const map = new Map<string, { trips: number; revenue: number; cost: number; profit: number }>()
  for (const row of rows) {
    const key = keyOf(row)
    const current = map.get(key) ?? { trips: 0, revenue: 0, cost: 0, profit: 0 }
    current.trips += 1
    current.revenue += row.revenue
    current.cost += row.totalCost
    current.profit += row.netProfit
    map.set(key, current)
  }
  return map
}

export async function loadAuthoritativeTripProfitability(input: ProfitabilityQuery = {}) {
  const { startDate, endDate } = dateRange(input)
  const page = Math.max(1, Number.isFinite(input.page) ? Number(input.page) : 1)
  const limit = Math.min(100, Math.max(1, Number.isFinite(input.limit) ? Number(input.limit) : 20))

  const where: Record<string, unknown> = {
    status: { in: ['reconciled', 'completed'] },
    departureTime: { gte: startDate, lte: endDate },
  }
  if (input.truckId) where.truckId = input.truckId
  if (input.driverId) where.driverId = input.driverId
  if (input.clientId) where.clientId = input.clientId
  if (input.route) {
    const parts = input.route.includes('→') ? input.route.split('→') : input.route.split('-')
    const [from, to] = parts.map((value) => value.trim())
    if (from && to) {
      where.loadingLocation = { contains: from }
      where.destination = { contains: to }
    }
  }

  const trips = await db.trip.findMany({
    where,
    include: {
      truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      driver: { select: { id: true, firstName: true, lastName: true } },
      client: { select: { id: true, companyName: true } },
      Invoice: { select: { status: true, subtotal: true } },
    },
    orderBy: { departureTime: 'desc' },
  })

  if (trips.length === 0) {
    return {
      trips: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
      summary: { totalRevenue: 0, totalCost: 0, totalProfit: 0, avgMargin: 0, profitableTrips: 0, lossTrips: 0, bestRoute: '--', worstRoute: '--', avgCostPerKm: 0 },
      byRoute: [], byTruck: [], byClient: [], monthlyTrend: [],
    }
  }

  const tripIds = trips.map((trip) => trip.id)
  const [reconciliations, driverLines, haulierSettlements, reconciliationExceptions, reconciliationAdjustments, settings] = await Promise.all([
    db.tripReconciliation.findMany({
      where: { tripId: { in: tripIds }, status: 'approved' },
      include: { lines: { orderBy: { createdAt: 'asc' } } },
      orderBy: [{ tripId: 'asc' }, { version: 'desc' }],
    }),
    db.settlementLine.findMany({
      where: {
        tripId: { in: tripIds },
        driverSettlement: { status: { in: ['approved', 'paid'] } },
      },
      select: {
        tripId: true,
        type: true,
        amount: true,
        driverSettlement: { select: { status: true } },
      },
    }),
    db.haulierSettlement.findMany({
      where: { tripId: { in: tripIds }, status: { in: ['approved', 'paid'] } },
      select: {
        tripId: true,
        status: true,
        baseFreight: true,
        detentionAmount: true,
        extrasAmount: true,
        shortageDeduction: true,
        fuelAdjustment: true,
        taxAmount: true,
        withholdingAmount: true,
        advanceDeduction: true,
      },
    }),
    db.reconciliationException.findMany({
      where: { tripId: { in: tripIds } },
      select: { tripId: true, type: true, status: true, amount: true },
    }),
    db.reconciliationAdjustment.findMany({
      where: { tripId: { in: tripIds } },
      select: { id: true, tripId: true, status: true, amount: true },
    }),
    db.systemSettings.findFirst({
      select: {
        profitabilityMaintenanceAllocationEnabled: true,
        profitabilityMaintenanceCostPerKm: true,
      },
    }),
  ])

  const reconciliationByTrip = new Map<string, (typeof reconciliations)[number]>()
  for (const reconciliation of reconciliations) {
    if (!reconciliationByTrip.has(reconciliation.tripId)) reconciliationByTrip.set(reconciliation.tripId, reconciliation)
  }

  const driverLinesByTrip = new Map<string, typeof driverLines>()
  for (const line of driverLines) {
    if (!line.tripId) continue
    const current = driverLinesByTrip.get(line.tripId) ?? []
    current.push(line)
    driverLinesByTrip.set(line.tripId, current)
  }

  const haulierByTrip = new Map(haulierSettlements.map((settlement) => [settlement.tripId, settlement]))
  const exceptionsByTrip = new Map<string, typeof reconciliationExceptions>()
  for (const exception of reconciliationExceptions) {
    const current = exceptionsByTrip.get(exception.tripId) ?? []
    current.push(exception)
    exceptionsByTrip.set(exception.tripId, current)
  }
  const adjustmentsByTrip = new Map<string, typeof reconciliationAdjustments>()
  for (const adjustment of reconciliationAdjustments) {
    const current = adjustmentsByTrip.get(adjustment.tripId) ?? []
    current.push(adjustment)
    adjustmentsByTrip.set(adjustment.tripId, current)
  }

  const maintenanceEnabled = settings?.profitabilityMaintenanceAllocationEnabled ?? false
  const maintenanceCostPerKm = Number(settings?.profitabilityMaintenanceCostPerKm ?? 0)

  const authoritative = trips.flatMap((trip) => {
    const reconciliation = reconciliationByTrip.get(trip.id)
    if (!reconciliation) return []
    const haulier = haulierByTrip.get(trip.id) ?? null
    const facts = buildTripFinancialFacts({
      tripId: trip.id,
      revenue: resolveConfirmedRevenue({
        tripRevenue: Number(trip.totalRevenue ?? 0),
        invoice: trip.Invoice ? { status: trip.Invoice.status, subtotal: Number(trip.Invoice.subtotal) } : null,
      }),
      reconciliation: {
        status: reconciliation.status,
        lines: reconciliation.lines.map((line) => ({
          sourceType: line.sourceType,
          sourceId: line.sourceId,
          category: line.category,
          amount: Number(line.amount),
          includedInCost: line.includedInCost,
        })),
      },
      driverSettlementLines: (driverLinesByTrip.get(trip.id) ?? []).map((line) => ({
        status: line.driverSettlement.status,
        type: line.type,
        amount: Number(line.amount),
      })),
      haulierSettlement: haulier ? {
        status: haulier.status,
        baseFreight: Number(haulier.baseFreight),
        detentionAmount: Number(haulier.detentionAmount),
        extrasAmount: Number(haulier.extrasAmount),
        shortageDeduction: Number(haulier.shortageDeduction),
        fuelAdjustment: Number(haulier.fuelAdjustment),
        taxAmount: Number(haulier.taxAmount),
        withholdingAmount: Number(haulier.withholdingAmount),
        advanceDeduction: Number(haulier.advanceDeduction),
      } : null,
      reconciliationExceptions: (exceptionsByTrip.get(trip.id) ?? []).map((exception) => ({
        type: exception.type,
        status: exception.status,
        amount: exception.amount == null ? null : Number(exception.amount),
      })),
      postAdjustments: (adjustmentsByTrip.get(trip.id) ?? []).map((adjustment) => ({
        id: adjustment.id,
        status: adjustment.status,
        amount: Number(adjustment.amount),
      })),
      maintenanceAllocation: calculateMaintenanceAllocation({
        enabled: maintenanceEnabled,
        costPerKm: maintenanceCostPerKm,
        distanceKm: Number(trip.totalMileage ?? 0),
      }),
      includeMaintenanceAllocation: maintenanceEnabled,
    })
    const calculation = calculateTripProfitability(facts)
    const distanceKm = Number(trip.totalMileage ?? 0)
    return [{
      id: trip.id,
      tripNumber: trip.tripNumber,
      departureTime: trip.departureTime.toISOString(),
      truck: trip.truck,
      driver: trip.driver,
      loadingLocation: trip.loadingLocation,
      destination: trip.destination,
      clientName: trip.client?.companyName ?? trip.customerName ?? null,
      revenue: calculation.revenue,
      fuelCost: calculation.fuelCost,
      expenses: round(calculation.totalDirectCost - calculation.fuelCost),
      totalCost: calculation.totalDirectCost,
      netProfit: calculation.contribution,
      margin: calculation.marginPercent,
      haulierCost: calculation.haulierCost,
      driverCost: calculation.driverCost,
      tollAndFeesCost: calculation.tollAndFeesCost,
      maintenanceCost: calculation.maintenanceCost,
      otherDirectCost: calculation.otherDirectCost,
      shortageDamageImpact: calculation.shortageDamageImpact,
      adjustmentAmount: calculation.adjustmentAmount,
      costPerKm: distanceKm > 0 ? round(calculation.totalDirectCost / distanceKm) : 0,
      distanceKm,
    }]
  })

  const routeMap = aggregate(authoritative, (row) => `${row.loadingLocation} → ${row.destination}`)
  const byRoute = Array.from(routeMap, ([route, value]) => ({
    route, ...value,
    revenue: round(value.revenue), cost: round(value.cost), profit: round(value.profit),
    margin: value.revenue > 0 ? round((value.profit / value.revenue) * 100) : 0,
  })).sort((a, b) => b.revenue - a.revenue)

  const truckMap = aggregate(authoritative, (row) => row.truck.id)
  const truckById = new Map(authoritative.map((row) => [row.truck.id, row.truck.plateNumber]))
  const byTruck = Array.from(truckMap, ([truckId, value]) => ({
    truckId, plateNumber: truckById.get(truckId) ?? truckId, ...value,
    revenue: round(value.revenue), cost: round(value.cost), profit: round(value.profit),
    margin: value.revenue > 0 ? round((value.profit / value.revenue) * 100) : 0,
  })).sort((a, b) => b.profit - a.profit)

  const clientMap = aggregate(authoritative, (row) => row.clientName ?? 'Unassigned')
  const byClient = Array.from(clientMap, ([clientName, value]) => ({
    clientName, ...value,
    revenue: round(value.revenue), cost: round(value.cost), profit: round(value.profit),
    margin: value.revenue > 0 ? round((value.profit / value.revenue) * 100) : 0,
  })).sort((a, b) => b.revenue - a.revenue)

  const monthlyMap = new Map<string, { month: string; revenue: number; cost: number; profit: number }>()
  for (const row of authoritative) {
    const month = new Date(row.departureTime).toLocaleString('en-US', { month: 'short', year: 'numeric' })
    const current = monthlyMap.get(month) ?? { month, revenue: 0, cost: 0, profit: 0 }
    current.revenue += row.revenue
    current.cost += row.totalCost
    current.profit += row.netProfit
    monthlyMap.set(month, current)
  }
  const monthlyTrend = Array.from(monthlyMap.values()).map((item) => ({
    ...item, revenue: round(item.revenue), cost: round(item.cost), profit: round(item.profit),
  }))

  const totalRevenue = round(authoritative.reduce((sum, row) => sum + row.revenue, 0))
  const totalCost = round(authoritative.reduce((sum, row) => sum + row.totalCost, 0))
  const totalProfit = round(authoritative.reduce((sum, row) => sum + row.netProfit, 0))
  const margins = authoritative.filter((row) => row.revenue > 0).map((row) => row.margin)
  const distance = authoritative.reduce((sum, row) => sum + row.distanceKm, 0)
  const bestRoute = byRoute.length ? [...byRoute].sort((a, b) => b.profit - a.profit)[0].route : '--'
  const worstRoute = byRoute.length ? [...byRoute].sort((a, b) => a.profit - b.profit)[0].route : '--'
  const paged = authoritative.slice((page - 1) * limit, page * limit)

  return {
    trips: paged,
    pagination: { page, limit, total: authoritative.length, totalPages: Math.ceil(authoritative.length / limit) },
    summary: {
      totalRevenue,
      totalCost,
      totalProfit,
      avgMargin: margins.length ? round(margins.reduce((sum, value) => sum + value, 0) / margins.length) : 0,
      profitableTrips: authoritative.filter((row) => row.netProfit > 0).length,
      lossTrips: authoritative.filter((row) => row.netProfit < 0).length,
      bestRoute,
      worstRoute,
      avgCostPerKm: distance > 0 ? round(totalCost / distance) : 0,
    },
    byRoute,
    byTruck,
    byClient,
    monthlyTrend,
  }
}
