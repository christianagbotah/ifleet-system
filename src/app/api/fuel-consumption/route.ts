import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth } from "@/lib/auth-server"
import { aggregateFuelAnalytics, normalizeFuelTrip } from "@/lib/domain/analytics/fuel-analytics"

function tripDateFilter(dateFrom: string | null, dateTo: string | null) {
  if (!dateFrom && !dateTo) return undefined
  return {
    ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
    ...(dateTo ? { lte: new Date(dateTo) } : {}),
  }
}

function monthsFromPeriod(period: string) {
  const value = Number.parseInt(period, 10)
  return Number.isFinite(value) && value > 0 ? value : ({ "1month": 1, "3months": 3, "6months": 6, "12months": 12, "24months": 24 }[period] ?? 6)
}

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const truckId = searchParams.get("truckId")
    const zoneId = searchParams.get("zoneId")
    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const period = searchParams.get("period") || "6months"

    const trips = await db.trip.findMany({
      where: {
        status: "completed",
        ...(truckId ? { truckId } : {}),
        ...(zoneId ? { destinationZoneId: zoneId } : {}),
        ...(tripDateFilter(dateFrom, dateTo) ? { departureTime: tripDateFilter(dateFrom, dateTo) } : {}),
      },
      select: {
        id: true,
        truckId: true,
        destinationZoneId: true,
        departureTime: true,
        totalMileage: true,
        fuelCost: true,
        fuelUsed: true,
        totalRevenue: true,
        TripReconciliation: { select: { distanceKm: true, fuelCost: true, revenue: true, consumedLiters: true, fuelAddedLiters: true } },
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        destinationZone: { select: { id: true, name: true, destinationCity: { select: { id: true, name: true } } } },
      },
      orderBy: { departureTime: "asc" },
    })

    const zoneIds = [...new Set(trips.map((trip) => trip.destinationZoneId).filter((value): value is string => Boolean(value)))]
    const rateRows = zoneIds.length ? await db.zoneRate.findMany({
      where: { destinationZoneId: { in: zoneIds }, isActive: true },
      orderBy: { effectiveDate: "desc" },
      select: { destinationZoneId: true, expectedFuelConsumption: true },
    }) : []
    const expectedFuelLitersByZone: Record<string, number> = {}
    for (const rate of rateRows) {
      if (expectedFuelLitersByZone[rate.destinationZoneId] === undefined && rate.expectedFuelConsumption != null) {
        expectedFuelLitersByZone[rate.destinationZoneId] = rate.expectedFuelConsumption
      }
    }

    const normalized = trips.map((trip) => normalizeFuelTrip({
      id: trip.id,
      truckId: trip.truckId,
      destinationZoneId: trip.destinationZoneId,
      departureTime: trip.departureTime,
      totalMileage: trip.totalMileage,
      fuelCost: trip.fuelCost,
      fuelUsed: trip.fuelUsed,
      totalRevenue: trip.totalRevenue,
      reconciliation: trip.TripReconciliation,
    }))
    const analytics = aggregateFuelAnalytics(normalized, { expectedFuelLitersByZone })

    const truckDetails = new Map(trips.map((trip) => [trip.truckId, trip.truck]))
    const zoneDetails = new Map(trips.filter((trip) => trip.destinationZone).map((trip) => [trip.destinationZoneId!, trip.destinationZone!]))

    const byTruck = analytics.byTruck.map((row) => ({
      ...row,
      plateNumber: truckDetails.get(row.truckId)?.plateNumber ?? "Unknown",
      make: truckDetails.get(row.truckId)?.make ?? "",
      model: truckDetails.get(row.truckId)?.model ?? "",
    }))
    const byZone = analytics.byZone.map((row) => ({
      ...row,
      zoneName: zoneDetails.get(row.zoneId)?.name ?? "Unknown",
      cityId: zoneDetails.get(row.zoneId)?.destinationCity.id ?? "",
      cityName: zoneDetails.get(row.zoneId)?.destinationCity.name ?? "",
    }))

    const monthsCount = monthsFromPeriod(period)
    const now = new Date()
    const monthlyTrend = Array.from({ length: monthsCount }, (_, index) => {
      const offset = monthsCount - index - 1
      const start = new Date(now.getFullYear(), now.getMonth() - offset, 1)
      const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1)
      const group = normalized.filter((row) => row.departureTime >= start && row.departureTime < end)
      const month = aggregateFuelAnalytics(group).summary
      return {
        month: start.toLocaleString("en-US", { month: "short", year: "numeric" }),
        year: start.getFullYear(),
        monthIndex: start.getMonth() + 1,
        totalFuelCost: month.totalFuelCost,
        totalRevenue: month.totalRevenue,
        tripCount: month.totalTrips,
        avgCostPerTrip: month.avgFuelCostPerTrip,
        fuelCostRatio: month.fuelAsPercentageOfRevenue,
        reconciledTrips: month.reconciledTrips,
        legacyProjectionTrips: month.legacyProjectionTrips,
      }
    })

    return NextResponse.json({
      summary: analytics.summary,
      byTruck,
      byZone,
      monthlyTrend,
      dataQuality: {
        reconciledTrips: analytics.summary.reconciledTrips,
        legacyProjectionTrips: analytics.summary.legacyProjectionTrips,
        expectedFuelBenchmark: "zone_expected_litres_x_observed_cost_per_litre",
      },
      rows: analytics.rows.map((row) => ({ tripId: row.tripId, source: row.source })),
    })
  } catch (error) {
    console.error("Fuel Consumption Analytics API error:", error)
    return NextResponse.json({ error: "Failed to load fuel consumption analytics" }, { status: 500 })
  }
}
