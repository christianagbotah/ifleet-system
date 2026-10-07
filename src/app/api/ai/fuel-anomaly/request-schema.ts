import { z } from "zod/v4"
import type { FuelAnomalySubject } from "@/lib/domain/fuel-intelligence/types"
import type { FuelAnomalyReviewInput } from "@/lib/services/fuel-anomaly-assessment-service"

const fuelLogSubject = z.object({ fuelLogId: z.string().trim().min(1) }).strict()
const tripSubject = z.object({ tripId: z.string().trim().min(1) }).strict()
const truckWindowSubject = z.object({
  truckId: z.string().trim().min(1),
  startDate: z.string().datetime({ offset: true }),
  endDate: z.string().datetime({ offset: true }),
}).strict()

const subjectSchema = z.union([fuelLogSubject, tripSubject, truckWindowSubject])

const outcomeSchema = z.enum([
  "verified_legitimate", "data_entry_error", "duplicate_record", "mechanical_issue",
  "route_or_operational_factor", "supplier_or_price_issue", "fuel_loss_confirmed",
  "policy_violation_confirmed", "insufficient_evidence", "other",
])

const reviewSchema = z.object({
  toStatus: z.enum(["acknowledged", "investigating", "resolved", "false_positive"]),
  outcomeCode: outcomeSchema.optional(),
  notes: z.string().trim().max(4000).optional(),
}).strict()

export function parseFuelAnomalySubject(input: unknown): FuelAnomalySubject {
  const parsed = subjectSchema.parse(input)
  if ("fuelLogId" in parsed) return { fuelLogId: parsed.fuelLogId }
  if ("tripId" in parsed) return { tripId: parsed.tripId }
  const startDate = new Date(parsed.startDate)
  const endDate = new Date(parsed.endDate)
  if (endDate < startDate) throw new Error("FUEL_ANOMALY_INVALID_WINDOW")
  return { truckId: parsed.truckId, startDate, endDate }
}

export function parseFuelAnomalyReviewInput(input: unknown): FuelAnomalyReviewInput {
  return reviewSchema.parse(input)
}
