export type FuelMetricSource = "reconciled" | "legacy_projection"

export type FuelTripSource = {
  id?: string
  tripId?: string
  truckId: string
  destinationZoneId?: string | null
  zoneId?: string | null
  departureTime: Date
  totalMileage?: number | null
  fuelCost?: unknown
  fuelUsed?: number | null
  totalRevenue?: unknown
  legacy?: {
    fuelCost?: unknown
    distanceKm?: number | null
    revenue?: unknown
    consumedLiters?: number | null
    fuelAddedLiters?: number | null
  }
  reconciliation?: {
    distanceKm: number | null
    fuelCost: unknown
    revenue: unknown
    consumedLiters: number | null
    fuelAddedLiters: number
  } | null
}

export type NormalizedFuelTrip = {
  tripId: string
  truckId: string
  zoneId: string | null
  departureTime: Date
  fuelCost: number
  distanceKm: number
  revenue: number
  consumedLiters: number
  fuelAddedLiters: number
  source: FuelMetricSource
}

export type FuelAnalyticsFilter = {
  truckId?: string | null
  zoneId?: string | null
  dateFrom?: Date | null
  dateTo?: Date | null
  expectedFuelLitersByZone?: Record<string, number>
}

const numberOrZero = (value: unknown) => value == null || !Number.isFinite(Number(value)) ? 0 : Number(value)
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export function normalizeFuelTrip(input: FuelTripSource): NormalizedFuelTrip {
  const reconciled = input.reconciliation
  const legacy = input.legacy ?? {
    fuelCost: input.fuelCost,
    distanceKm: input.totalMileage,
    revenue: input.totalRevenue,
    consumedLiters: input.fuelUsed,
    fuelAddedLiters: input.fuelUsed,
  }
  const consumedLiters = reconciled?.consumedLiters ?? legacy.consumedLiters ?? 0
  const fuelAddedLiters = reconciled?.fuelAddedLiters ?? legacy.fuelAddedLiters ?? legacy.consumedLiters ?? 0

  return {
    tripId: input.tripId ?? input.id ?? "",
    truckId: input.truckId,
    zoneId: input.zoneId ?? input.destinationZoneId ?? null,
    departureTime: input.departureTime,
    fuelCost: reconciled ? numberOrZero(reconciled.fuelCost) : numberOrZero(legacy.fuelCost),
    distanceKm: reconciled ? numberOrZero(reconciled.distanceKm) : numberOrZero(legacy.distanceKm),
    revenue: reconciled ? numberOrZero(reconciled.revenue ?? legacy.revenue) : numberOrZero(legacy.revenue),
    consumedLiters: numberOrZero(consumedLiters),
    fuelAddedLiters: numberOrZero(fuelAddedLiters),
    source: reconciled ? "reconciled" : "legacy_projection",
  }
}

export function aggregateFuelAnalytics(
  rows: NormalizedFuelTrip[],
  filter: FuelAnalyticsFilter = {},
) {
  const selected = rows.filter((row) => {
    if (filter.zoneId && row.zoneId !== filter.zoneId) return false
    if (filter.truckId && row.truckId !== filter.truckId) return false
    if (filter.dateFrom && row.departureTime < filter.dateFrom) return false
    if (filter.dateTo && row.departureTime > filter.dateTo) return false
    return true
  })

  const summarize = (group: NormalizedFuelTrip[]) => {
    const totalFuelCost = group.reduce((sum, row) => sum + row.fuelCost, 0)
    const totalDistance = group.reduce((sum, row) => sum + row.distanceKm, 0)
    const totalRevenue = group.reduce((sum, row) => sum + row.revenue, 0)
    const consumedLiters = group.reduce((sum, row) => sum + row.consumedLiters, 0)
    const fuelAddedLiters = group.reduce((sum, row) => sum + row.fuelAddedLiters, 0)
    return { totalFuelCost, totalDistance, totalRevenue, consumedLiters, fuelAddedLiters }
  }

  const totals = summarize(selected)
  const totalTrips = selected.length

  const byTruckMap = new Map<string, NormalizedFuelTrip[]>()
  const byZoneMap = new Map<string, NormalizedFuelTrip[]>()
  for (const row of selected) {
    byTruckMap.set(row.truckId, [...(byTruckMap.get(row.truckId) ?? []), row])
    if (row.zoneId) byZoneMap.set(row.zoneId, [...(byZoneMap.get(row.zoneId) ?? []), row])
  }

  const byTruck = [...byTruckMap.entries()].map(([truckId, group]) => {
    const groupTotals = summarize(group)
    return {
      truckId,
      tripCount: group.length,
      totalFuelCost: round2(groupTotals.totalFuelCost),
      totalDistance: round2(groupTotals.totalDistance),
      totalRevenue: round2(groupTotals.totalRevenue),
      consumedLiters: round2(groupTotals.consumedLiters),
      fuelAddedLiters: round2(groupTotals.fuelAddedLiters),
      avgCostPerTrip: round2(group.length ? groupTotals.totalFuelCost / group.length : 0),
      avgCostPerKm: round2(groupTotals.totalDistance ? groupTotals.totalFuelCost / groupTotals.totalDistance : 0),
      litersPer100Km: round2(groupTotals.totalDistance ? groupTotals.consumedLiters * 100 / groupTotals.totalDistance : 0),
      fuelCostRatio: round2(groupTotals.totalRevenue ? groupTotals.totalFuelCost / groupTotals.totalRevenue * 100 : 0),
      reconciledTrips: group.filter((row) => row.source === "reconciled").length,
      legacyTrips: group.filter((row) => row.source === "legacy_projection").length,
    }
  })

  const byZone = [...byZoneMap.entries()].map(([zoneId, group]) => {
    const groupTotals = summarize(group)
    const expectedLitersPerTrip = filter.expectedFuelLitersByZone?.[zoneId]
    const expectedFuelLiters = expectedLitersPerTrip == null ? null : expectedLitersPerTrip * group.length
    const averageCostPerLiter = groupTotals.fuelAddedLiters > 0
      ? groupTotals.totalFuelCost / groupTotals.fuelAddedLiters
      : null
    const expectedFuelCost = expectedFuelLiters != null && averageCostPerLiter != null
      ? expectedFuelLiters * averageCostPerLiter
      : null
    const deviation = expectedFuelCost == null ? 0 : groupTotals.totalFuelCost - expectedFuelCost

    return {
      zoneId,
      tripCount: group.length,
      actualFuelCost: round2(groupTotals.totalFuelCost),
      expectedFuelLiters: expectedFuelLiters == null ? null : round2(expectedFuelLiters),
      expectedFuelCost: expectedFuelCost == null ? null : round2(expectedFuelCost),
      deviation: round2(deviation),
      deviationPercent: expectedFuelCost && expectedFuelCost > 0 ? round2(deviation / expectedFuelCost * 100) : 0,
      reconciledTrips: group.filter((row) => row.source === "reconciled").length,
      legacyTrips: group.filter((row) => row.source === "legacy_projection").length,
    }
  })

  return {
    rows: selected,
    summary: {
      totalFuelCost: round2(totals.totalFuelCost),
      totalTrips,
      totalDistance: round2(totals.totalDistance),
      totalRevenue: round2(totals.totalRevenue),
      consumedLiters: round2(totals.consumedLiters),
      fuelAddedLiters: round2(totals.fuelAddedLiters),
      avgFuelCostPerTrip: round2(totalTrips ? totals.totalFuelCost / totalTrips : 0),
      avgFuelCostPerKm: round2(totals.totalDistance ? totals.totalFuelCost / totals.totalDistance : 0),
      litersPer100Km: round2(totals.totalDistance ? totals.consumedLiters * 100 / totals.totalDistance : 0),
      fuelAsPercentageOfRevenue: round2(totals.totalRevenue ? totals.totalFuelCost / totals.totalRevenue * 100 : 0),
      reconciledTrips: selected.filter((row) => row.source === "reconciled").length,
      legacyProjectionTrips: selected.filter((row) => row.source === "legacy_projection").length,
    },
    byTruck,
    byZone,
  }
}
