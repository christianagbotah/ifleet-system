export type FuelEventInput = {
  liters: number
  totalCost: number
  eventType: "purchase" | "company_issue" | "external_issue" | "emergency" | "reversal"
}

export type FuelReconciliationInput = {
  distanceKm: number | null
  openingTankLiters: number | null
  closingTankLiters: number | null
  events: FuelEventInput[]
}

export type FuelReconciliationResult = {
  fuelAddedLiters: number
  fuelCost: number
  consumedLiters: number | null
  consumptionBasis: "tank_reconciled" | "fuel_added" | "unavailable"
  kmPerLiter: number | null
  litersPer100Km: number | null
  fuelCostPerKm: number | null
}

const zeroTiny = (value: number) => Math.abs(value) < 1e-9 ? 0 : value

export function reconcileFuel(input: FuelReconciliationInput): FuelReconciliationResult {
  const totals = input.events.reduce(
    (acc, event) => {
      const sign = event.eventType === "reversal" ? -1 : 1
      acc.liters += sign * event.liters
      acc.cost += sign * event.totalCost
      return acc
    },
    { liters: 0, cost: 0 },
  )

  const fuelAddedLiters = zeroTiny(totals.liters)
  const fuelCost = zeroTiny(totals.cost)
  const hasTankReconciliation =
    input.openingTankLiters != null &&
    input.closingTankLiters != null &&
    Number.isFinite(input.openingTankLiters) &&
    Number.isFinite(input.closingTankLiters)

  let consumedLiters: number | null = null
  let consumptionBasis: FuelReconciliationResult["consumptionBasis"] = "unavailable"

  if (hasTankReconciliation) {
    const reconciled = zeroTiny(input.openingTankLiters! + fuelAddedLiters - input.closingTankLiters!)
    if (reconciled > 0) {
      consumedLiters = reconciled
      consumptionBasis = "tank_reconciled"
    }
  } else if (fuelAddedLiters > 0) {
    consumedLiters = fuelAddedLiters
    consumptionBasis = "fuel_added"
  }

  const hasDistance = input.distanceKm != null && Number.isFinite(input.distanceKm) && input.distanceKm > 0
  const hasConsumption = consumedLiters != null && consumedLiters > 0

  return {
    fuelAddedLiters,
    fuelCost,
    consumedLiters,
    consumptionBasis,
    kmPerLiter: hasDistance && hasConsumption ? input.distanceKm! / consumedLiters! : null,
    litersPer100Km: hasDistance && hasConsumption ? (consumedLiters! * 100) / input.distanceKm! : null,
    fuelCostPerKm: hasDistance ? fuelCost / input.distanceKm! : null,
  }
}
