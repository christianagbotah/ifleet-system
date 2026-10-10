export interface FuelBaselineTrip {
  fuelUsed: number | null
  totalMileage: number | null
  startMileage: number | null
  endMileage: number | null
}

export interface FuelRouteBaseline {
  litersPer100Km: number | null
  sampleCount: number
}

function tripDistance(trip: FuelBaselineTrip): number | null {
  if (trip.totalMileage != null && trip.totalMileage > 0) return trip.totalMileage
  if (trip.startMileage != null && trip.endMileage != null && trip.endMileage > trip.startMileage) {
    return trip.endMileage - trip.startMileage
  }
  return null
}

export function calculateRouteFuelBaseline(trips: FuelBaselineTrip[]): FuelRouteBaseline {
  const samples = trips.flatMap((trip) => {
    const distance = tripDistance(trip)
    if (trip.fuelUsed == null || trip.fuelUsed <= 0 || distance == null) return []
    const value = trip.fuelUsed / distance * 100
    return Number.isFinite(value) && value > 0 && value < 200 ? [value] : []
  })

  return {
    litersPer100Km: samples.length > 0
      ? samples.reduce((sum, value) => sum + value, 0) / samples.length
      : null,
    sampleCount: samples.length,
  }
}
