export type WeightVarianceStatus = "verified" | "variance_detected"
export type WeightVarianceClass = "within_tolerance" | "over" | "under"

export class WeightVarianceError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = "WeightVarianceError"
  }
}

export type WeightVarianceResult = {
  variance: number | null
  variancePercent: number | null
  status: WeightVarianceStatus
  varianceClass: WeightVarianceClass
}

export function calculateWeightVariance(verifiedWeight: number, declaredWeight: number | null): WeightVarianceResult {
  if (!Number.isFinite(verifiedWeight) || verifiedWeight <= 0) {
    throw new WeightVarianceError("INVALID_VERIFIED_WEIGHT", "Verified weight must be a positive finite number")
  }
  if (declaredWeight == null) {
    return { variance: null, variancePercent: null, status: "verified", varianceClass: "within_tolerance" }
  }
  if (!Number.isFinite(declaredWeight) || declaredWeight <= 0) {
    throw new WeightVarianceError("INVALID_DECLARED_WEIGHT", "Declared weight must be a positive finite number")
  }

  const variance = verifiedWeight - declaredWeight
  const variancePercent = (variance / declaredWeight) * 100
  const varianceClass: WeightVarianceClass =
    variancePercent > 5 ? "over" : variancePercent < -5 ? "under" : "within_tolerance"

  return {
    variance,
    variancePercent,
    status: varianceClass === "within_tolerance" ? "verified" : "variance_detected",
    varianceClass,
  }
}
