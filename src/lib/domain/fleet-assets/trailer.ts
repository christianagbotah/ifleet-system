import { z } from 'zod'

export const trailerStatuses = [
  'active',
  'inactive',
  'maintenance',
  'out_of_service',
  'retired',
  'decommissioned',
] as const

const optionalText = z.string().trim().min(1).optional().nullable()
const optionalPositiveNumber = z.coerce.number().positive().optional().nullable()
const optionalDate = z.coerce.date().optional().nullable()

const trailerFields = z.object({
  plateNumber: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase()),
  vinNumber: optionalText,
  chassisNumber: optionalText,
  trailerType: z.string().trim().min(1).max(80),
  bodyType: optionalText,
  axleCount: z.coerce.number().int().min(1).max(12).optional().nullable(),
  axleConfiguration: optionalText,
  tareWeight: optionalPositiveNumber,
  maxPayload: optionalPositiveNumber,
  length: optionalPositiveNumber,
  width: optionalPositiveNumber,
  height: optionalPositiveNumber,
  transporterId: optionalText,
  vehicleOwnerId: optionalText,
  telematicsDeviceRef: optionalText,
  registrationExpiry: optionalDate,
  roadworthyExpiry: optionalDate,
  lastInspectionAt: optionalDate,
  nextInspectionAt: optionalDate,
  status: z.enum(trailerStatuses).optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
})

export const trailerCreateSchema = trailerFields.extend({
  status: z.enum(trailerStatuses).default('active'),
})

export const trailerUpdateSchema = trailerFields.partial()

export type TrailerCreateInput = z.infer<typeof trailerCreateSchema>
export type TrailerUpdateInput = z.infer<typeof trailerUpdateSchema>
