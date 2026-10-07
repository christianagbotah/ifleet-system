import { DEFAULT_FUEL_ANOMALY_POLICY } from "./policy"
import type {
  FuelAnomalyFindingDraft,
  FuelAnomalyPolicy,
  FuelAssessmentEvidence,
  FuelEvidenceEvent,
} from "./types"

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function normalizedText(value: string | null): string {
  return value?.trim().toLowerCase() ?? ""
}

function finding(
  evidence: FuelAssessmentEvidence,
  input: Omit<FuelAnomalyFindingDraft, "fuelLogId" | "tripId" | "truckId" | "driverId"> &
    Partial<Pick<FuelAnomalyFindingDraft, "fuelLogId" | "tripId" | "truckId" | "driverId">>,
): FuelAnomalyFindingDraft {
  return {
    ...input,
    fuelLogId: input.fuelLogId ?? evidence.fuelLogId,
    tripId: input.tripId ?? evidence.tripId,
    truckId: input.truckId ?? evidence.truckId,
    driverId: input.driverId ?? evidence.driverId,
  }
}

function minutesBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 60_000
}

function isVerifiedFuelAddition(event: FuelEvidenceEvent): boolean {
  return event.verificationStatus === "verified" && event.eventType !== "reversal" && event.eventType !== "tank_observation" && event.liters > 0
}

export function evaluateFuelIntegrityRules(
  evidence: FuelAssessmentEvidence,
  policy: FuelAnomalyPolicy = DEFAULT_FUEL_ANOMALY_POLICY,
): FuelAnomalyFindingDraft[] {
  const findings: FuelAnomalyFindingDraft[] = []
  const verifiedAdds = evidence.fuelEvents.filter(isVerifiedFuelAddition)

  if (finite(evidence.truckTankCapacityLiters) && evidence.evidenceAvailability.tankCapacity === "known") {
    const maxFill = evidence.truckTankCapacityLiters * (1 + policy.tankCapacityToleranceRatio)
    for (const fuelEvent of verifiedAdds) {
      if (fuelEvent.liters > maxFill) {
        findings.push(finding(evidence, {
          code: "FUEL_TANK_CAPACITY_EXCEEDED",
          severity: "high",
          riskContribution: 28,
          confidence: 0.98,
          dataQuality: 0.95,
          strongEvidence: true,
          correlationKey: `tank:${fuelEvent.id}`,
          evidence: { fuelLogId: fuelEvent.id, liters: fuelEvent.liters, tankCapacityLiters: evidence.truckTankCapacityLiters, toleranceRatio: policy.tankCapacityToleranceRatio },
          reason: "Verified fuel volume exceeds the known tank capacity plus measurement tolerance.",
          recommendedAction: "Review the fuel event, receipt, tank-capacity record and physical fueling evidence.",
          fuelLogId: fuelEvent.id,
        }))
      }
    }
  }

  for (const fuelEvent of verifiedAdds) {
    if (finite(fuelEvent.fuelLevelBeforeLiters) && finite(fuelEvent.fuelLevelAfterLiters)) {
      const observedIncrease = fuelEvent.fuelLevelAfterLiters - fuelEvent.fuelLevelBeforeLiters
      if (Math.abs(observedIncrease - fuelEvent.liters) > policy.tankLevelToleranceLiters) {
        findings.push(finding(evidence, {
          code: "FUEL_FILL_LEVEL_CONTRADICTION",
          severity: "high",
          riskContribution: 25,
          confidence: 0.94,
          dataQuality: 0.9,
          strongEvidence: true,
          correlationKey: `tank:${fuelEvent.id}`,
          evidence: { fuelLogId: fuelEvent.id, recordedLiters: fuelEvent.liters, observedIncreaseLiters: observedIncrease, toleranceLiters: policy.tankLevelToleranceLiters },
          reason: "Recorded litres conflict with the verified before/after tank observations.",
          recommendedAction: "Verify the meter reading, tank observations and receipt before drawing a conclusion.",
          fuelLogId: fuelEvent.id,
        }))
      }
    }
  }

  if (finite(evidence.openingTankLiters) && finite(evidence.closingTankLiters) && finite(evidence.netFuelAddedLiters)) {
    const impliedConsumption = evidence.openingTankLiters + evidence.netFuelAddedLiters - evidence.closingTankLiters
    if (impliedConsumption < -policy.tankLevelToleranceLiters) {
      findings.push(finding(evidence, {
        code: "FUEL_TANK_BALANCE_NEGATIVE",
        severity: "critical",
        riskContribution: 40,
        confidence: 0.99,
        dataQuality: 0.95,
        strongEvidence: true,
        correlationKey: "tank:balance",
        evidence: { openingTankLiters: evidence.openingTankLiters, netFuelAddedLiters: evidence.netFuelAddedLiters, closingTankLiters: evidence.closingTankLiters, impliedConsumptionLiters: impliedConsumption },
        reason: "Verified tank balance implies physically impossible negative fuel consumption.",
        recommendedAction: "Review tank observations and fuel postings for measurement or recording errors.",
      }))
    } else if (finite(evidence.reconciledConsumedLiters) && impliedConsumption - evidence.reconciledConsumedLiters > policy.unexplainedTankLossToleranceLiters) {
      findings.push(finding(evidence, {
        code: "FUEL_TANK_LOSS_UNEXPLAINED",
        severity: "high",
        riskContribution: 30,
        confidence: 0.9,
        dataQuality: 0.9,
        strongEvidence: true,
        correlationKey: "tank:balance",
        evidence: { impliedConsumptionLiters: impliedConsumption, reconciledConsumedLiters: evidence.reconciledConsumedLiters, unexplainedLiters: impliedConsumption - evidence.reconciledConsumedLiters, toleranceLiters: policy.unexplainedTankLossToleranceLiters },
        reason: "Tank observations show materially more fuel loss than reconciled consumption explains.",
        recommendedAction: "Review tank measurements, trip activity and related fuel events.",
      }))
    }
  }

  if (
    evidence.physicalEfficiencyBounds &&
    evidence.evidenceAvailability.physicalEfficiencyBounds === "known" &&
    finite(evidence.distanceKm) && evidence.distanceKm > 0 &&
    finite(evidence.reconciledConsumedLiters) && evidence.reconciledConsumedLiters > 0
  ) {
    const kmPerLiter = evidence.distanceKm / evidence.reconciledConsumedLiters
    if (kmPerLiter < evidence.physicalEfficiencyBounds.minKmPerLiter || kmPerLiter > evidence.physicalEfficiencyBounds.maxKmPerLiter) {
      findings.push(finding(evidence, {
        code: "FUEL_CONSUMPTION_EXTREME_PHYSICAL",
        severity: "high",
        riskContribution: 26,
        confidence: 0.9,
        dataQuality: 0.9,
        strongEvidence: true,
        correlationKey: "consumption:physical",
        evidence: { kmPerLiter, bounds: evidence.physicalEfficiencyBounds, truckClass: evidence.truckClass },
        reason: "Reconciled fuel efficiency is outside explicit physical bounds configured for this truck class.",
        recommendedAction: "Review reconciliation, vehicle condition, load and fuel evidence.",
      }))
    }
  }

  if (finite(evidence.netFuelAddedLiters) && evidence.netFuelAddedLiters >= policy.meaningfulFuelLiters && finite(evidence.distanceKm) && evidence.distanceKm <= policy.nearZeroDistanceKm) {
    findings.push(finding(evidence, {
      code: "FUEL_ADDED_WITH_NO_DISTANCE",
      severity: "medium",
      riskContribution: 16,
      confidence: 0.82,
      dataQuality: 0.85,
      strongEvidence: false,
      correlationKey: "movement:fuel",
      evidence: { distanceKm: evidence.distanceKm, netFuelAddedLiters: evidence.netFuelAddedLiters, nearZeroDistanceKm: policy.nearZeroDistanceKm },
      reason: "Material verified fuel was added while authoritative distance is near zero.",
      recommendedAction: "Check whether the fuel was for idling, depot operations, a later trip or another legitimate use.",
    }))
  }

  if (
    finite(evidence.distanceKm) && evidence.distanceKm >= policy.meaningfulMovementKm &&
    (!finite(evidence.reconciledConsumedLiters) || evidence.reconciledConsumedLiters <= 0) &&
    (!finite(evidence.netFuelAddedLiters) || evidence.netFuelAddedLiters <= 0) &&
    verifiedAdds.length === 0
  ) {
    findings.push(finding(evidence, {
      code: "FUEL_DISTANCE_WITH_NO_USABLE_FUEL",
      severity: "info",
      riskContribution: 4,
      confidence: 0.45,
      dataQuality: 0.45,
      strongEvidence: false,
      correlationKey: "movement:fuel",
      evidence: { distanceKm: evidence.distanceKm },
      reason: "Meaningful verified movement exists without usable fuel evidence in the assessed scope.",
      recommendedAction: "Check pre-existing tank fuel, external fueling and missing records before interpreting the variance.",
    }))
  }

  if (evidence.reconciliationExceptionCount >= policy.reconciliationExceptionClusterCount) {
    findings.push(finding(evidence, {
      code: "FUEL_RECONCILIATION_EXCEPTION_CLUSTER",
      severity: "medium",
      riskContribution: 12,
      confidence: 0.7,
      dataQuality: 0.6,
      strongEvidence: false,
      correlationKey: "reconciliation:exceptions",
      evidence: { exceptionCount: evidence.reconciliationExceptionCount, threshold: policy.reconciliationExceptionClusterCount },
      reason: "Repeated reconciliation exceptions reduce confidence in the fuel record and require evidence review.",
      recommendedAction: "Resolve the underlying reconciliation exceptions before escalating the anomaly.",
    }))
  }

  const receiptGroups = new Map<string, FuelEvidenceEvent[]>()
  for (const fuelEvent of evidence.fuelEvents.filter((item) => item.verificationStatus === "verified")) {
    const receipt = normalizedText(fuelEvent.receiptNumber)
    if (!receipt) continue
    receiptGroups.set(receipt, [...(receiptGroups.get(receipt) ?? []), fuelEvent])
  }
  for (const [receipt, items] of receiptGroups) {
    if (items.length < 2) continue
    const incompatible = items.some((item) => item.tripId !== items[0].tripId || item.truckId !== items[0].truckId)
    if (!incompatible) continue
    findings.push(finding(evidence, {
      code: "FUEL_RECEIPT_REUSE",
      severity: "high",
      riskContribution: 22,
      confidence: 0.92,
      dataQuality: 0.9,
      strongEvidence: true,
      correlationKey: `receipt:${receipt}`,
      evidence: { receiptNumber: items[0].receiptNumber, fuelLogIds: items.map((item) => item.id) },
      reason: "The same receipt identifier appears on incompatible verified fuel events.",
      recommendedAction: "Review the original receipt and verify which event it belongs to.",
      fuelLogId: items[0].id,
    }))
  }

  const duplicateCandidates = verifiedAdds.slice().sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id))
  outer: for (let i = 0; i < duplicateCandidates.length; i += 1) {
    for (let j = i + 1; j < duplicateCandidates.length; j += 1) {
      const a = duplicateCandidates[i]
      const b = duplicateCandidates[j]
      if (minutesBetween(a.occurredAt, b.occurredAt) > policy.nearDuplicateWindowMinutes) break
      if (a.truckId !== b.truckId || a.eventType !== b.eventType || normalizedText(a.stationName) !== normalizedText(b.stationName)) continue
      if (Math.abs(a.liters - b.liters) > policy.nearDuplicateLitersTolerance) continue
      if (Math.abs(a.totalCost - b.totalCost) > policy.nearDuplicateCostTolerance) continue
      findings.push(finding(evidence, {
        code: "FUEL_NEAR_DUPLICATE_EVENT",
        severity: "medium",
        riskContribution: 15,
        confidence: 0.82,
        dataQuality: 0.85,
        strongEvidence: false,
        correlationKey: `duplicate:${a.id}:${b.id}`,
        evidence: { fuelLogIds: [a.id, b.id], windowMinutes: policy.nearDuplicateWindowMinutes },
        reason: "Two verified fuel events are unusually similar in time, volume, cost and station context.",
        recommendedAction: "Compare the receipts and capture evidence to rule out an accidental duplicate.",
        fuelLogId: a.id,
      }))
      break outer
    }
  }

  const reversals = evidence.fuelEvents.filter((item) => item.eventType === "reversal" && item.verificationStatus === "verified")
  if (reversals.length >= policy.reversalClusterCount) {
    findings.push(finding(evidence, {
      code: "FUEL_REVERSAL_PATTERN",
      severity: "medium",
      riskContribution: 15,
      confidence: 0.75,
      dataQuality: 0.8,
      strongEvidence: false,
      correlationKey: "reversal:cluster",
      evidence: { reversalCount: reversals.length, threshold: policy.reversalClusterCount, fuelLogIds: reversals.map((item) => item.id) },
      reason: "The assessed scope contains an unusual cluster of fuel reversals.",
      recommendedAction: "Review reversal reasons and the original fuel events for legitimate corrections.",
    }))
  }

  const verifiedTargetReversals = reversals.filter((item) => item.reversalTargetWasVerified)
  if (verifiedTargetReversals.length >= policy.postVerificationReversalClusterCount) {
    findings.push(finding(evidence, {
      code: "FUEL_POST_VERIFICATION_REVERSAL_CLUSTER",
      severity: "high",
      riskContribution: 20,
      confidence: 0.86,
      dataQuality: 0.85,
      strongEvidence: false,
      correlationKey: "reversal:cluster",
      evidence: { reversalCount: verifiedTargetReversals.length, threshold: policy.postVerificationReversalClusterCount, fuelLogIds: verifiedTargetReversals.map((item) => item.id) },
      reason: "Multiple previously verified fuel events were later reversed in the assessed scope.",
      recommendedAction: "Review the verification and reversal audit trail for each affected event.",
    }))
  }

  for (const fuelEvent of evidence.fuelEvents) {
    const hasGps = finite(fuelEvent.latitude) && finite(fuelEvent.longitude)
    if (fuelEvent.gpsRequiredByCapturePolicy && !hasGps) {
      findings.push(finding(evidence, {
        code: "FUEL_LOCATION_EVIDENCE_MISSING",
        severity: "info",
        riskContribution: 2,
        confidence: 0.5,
        dataQuality: 0.4,
        strongEvidence: false,
        correlationKey: `location:${fuelEvent.id}`,
        evidence: { fuelLogId: fuelEvent.id, source: fuelEvent.source },
        reason: "Fueling location evidence is missing even though capture policy expected GPS for this event.",
        recommendedAction: "Check device/location capture availability; do not infer a route deviation without GPS evidence.",
        fuelLogId: fuelEvent.id,
      }))
    }
    if (
      hasGps &&
      evidence.evidenceAvailability.gps === "known" &&
      evidence.evidenceAvailability.routeGeofence === "known" &&
      fuelEvent.insideExpectedFuelingArea === false
    ) {
      findings.push(finding(evidence, {
        code: "FUEL_LOCATION_OUTSIDE_EXPECTED_AREA",
        severity: "medium",
        riskContribution: 15,
        confidence: 0.82,
        dataQuality: 0.85,
        strongEvidence: false,
        correlationKey: `location:${fuelEvent.id}`,
        evidence: { fuelLogId: fuelEvent.id, latitude: fuelEvent.latitude, longitude: fuelEvent.longitude, routeKey: evidence.routeKey },
        reason: "Reliable fueling GPS is outside the expected fueling area derived from authoritative route/geofence evidence.",
        recommendedAction: "Review the route, approved fueling locations and operational context.",
        fuelLogId: fuelEvent.id,
      }))
    }
  }

  return findings.sort((a, b) => a.code.localeCompare(b.code) || (a.fuelLogId ?? "").localeCompare(b.fuelLogId ?? ""))
}
