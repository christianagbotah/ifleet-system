import type { OdometerReading, ObservationSource, Prisma, VerificationStatus } from "@/generated/client"
import { validateOdometerReading, type OdometerReadingType } from "@/lib/domain/odometer/validation"

export class OdometerDomainError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = "OdometerDomainError"
  }
}

export type RecordOdometerInput = {
  truckId: string
  tripId?: string | null
  reading: number
  recordedAt?: Date
  readingType: OdometerReadingType
  source?: ObservationSource
  verificationStatus?: VerificationStatus
  evidence?: string | null
  capturedBy?: string | null
  adjustmentReason?: string | null
  supersedesId?: string | null
  allowAdjustment?: boolean
}

async function recordInTransaction(
  input: RecordOdometerInput,
  tx: Prisma.TransactionClient,
): Promise<OdometerReading> {
  let tripStartReading: number | null = null

  if (input.tripId) {
    const trip = await tx.trip.findUnique({
      where: { id: input.tripId },
      select: { truckId: true, startMileage: true },
    })
    if (!trip) throw new OdometerDomainError("TRIP_NOT_FOUND", "Trip not found")
    if (trip.truckId !== input.truckId) {
      throw new OdometerDomainError("TRIP_TRUCK_MISMATCH", "Odometer reading truck does not match the trip truck")
    }

    if (input.readingType === "trip_end") {
      const start = await tx.odometerReading.findFirst({
        where: { tripId: input.tripId, readingType: "trip_start", verificationStatus: "verified" },
        orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }],
        select: { reading: true },
      })
      tripStartReading = start?.reading ?? trip.startMileage ?? null
    }
  }

  if (input.readingType === "manual_adjustment" && input.allowAdjustment && !input.adjustmentReason?.trim()) {
    throw new OdometerDomainError("ADJUSTMENT_REASON_REQUIRED", "Manual odometer adjustments require an audit reason")
  }

  const latest = await tx.odometerReading.findFirst({
    where: { truckId: input.truckId, verificationStatus: "verified" },
    orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }],
    select: { reading: true },
  })

  const validation = validateOdometerReading({
    latestVerifiedReading: latest?.reading ?? null,
    tripStartReading,
    candidateReading: input.reading,
    readingType: input.readingType,
    allowAdjustment: input.allowAdjustment,
  })
  if (!validation.valid) throw new OdometerDomainError(validation.code, validation.message)

  const verificationStatus = input.verificationStatus ?? "pending"
  const row = await tx.odometerReading.create({
    data: {
      truckId: input.truckId,
      tripId: input.tripId ?? null,
      reading: input.reading,
      recordedAt: input.recordedAt,
      readingType: input.readingType,
      source: input.source ?? "manual",
      verificationStatus,
      evidence: input.evidence ?? null,
      capturedBy: input.capturedBy ?? null,
      adjustmentReason: input.adjustmentReason?.trim() || null,
      supersedesId: input.supersedesId ?? null,
    },
  })

  const isNewerVerifiedReading = verificationStatus === "verified" && (latest == null || input.reading > latest.reading)
  if (isNewerVerifiedReading) {
    await tx.truck.update({ where: { id: input.truckId }, data: { currentMileage: input.reading } })
  }

  return row
}

export async function recordOdometerReading(
  input: RecordOdometerInput,
  tx?: Prisma.TransactionClient,
): Promise<OdometerReading> {
  if (tx) return recordInTransaction(input, tx)
  const { db } = await import("@/lib/db")
  return db.$transaction((transaction) => recordInTransaction(input, transaction))
}
