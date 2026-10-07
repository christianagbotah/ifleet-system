import { z } from "zod"

const dispatchTripDraftSchema = z.object({
  departureTime: z.coerce.date(),
  destinationZoneId: z.string().min(1).nullable().optional(),
  quantity: z.coerce.number().positive().nullable().optional(),
  cargoUnit: z.string().trim().min(1).max(40).nullable().optional(),
}).strict()

const dispatchRecommendationByTripIdSchema = z.object({
  tripId: z.string().trim().min(1),
}).strict()

const dispatchRecommendationByDraftSchema = z.object({
  tripDraft: dispatchTripDraftSchema,
}).strict()

export const dispatchRecommendationRequestSchema = z.union([
  dispatchRecommendationByTripIdSchema,
  dispatchRecommendationByDraftSchema,
])

const acceptedDispatchDecisionSchema = z.object({
  decision: z.literal("accepted"),
  selectedDriverId: z.string().trim().min(1),
  selectedTruckId: z.string().trim().min(1),
  reason: z.string().trim().max(500).optional(),
}).strict()

const rejectedDispatchDecisionSchema = z.object({
  decision: z.literal("rejected"),
  reason: z.string().trim().max(500).optional(),
}).strict()

export const dispatchDecisionSchema = z.discriminatedUnion("decision", [
  acceptedDispatchDecisionSchema,
  rejectedDispatchDecisionSchema,
])

export type DispatchRecommendationRequest = z.infer<typeof dispatchRecommendationRequestSchema>
export type DispatchDecisionRequest = z.infer<typeof dispatchDecisionSchema>
