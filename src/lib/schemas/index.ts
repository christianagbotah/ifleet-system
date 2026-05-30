/**
 * Shared Zod validation schemas for backend API routes.
 * These provide consistent, declarative input validation with
 * automatic type inference and descriptive error messages.
 */
import { z } from 'zod'

// ─── Auth Schemas ─────────────────────────────────────────────────────────

/** Login: email + password */
export const loginSchema = z.object({
  email: z.string().email('Please provide a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

/** Forgot password: email only */
export const forgotPasswordSchema = z.object({
  email: z.string().email('Please provide a valid email address'),
})

/** Reset password: token + new password */
export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset code is required').max(256, 'Reset code is too long'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
})

/** Change password (authenticated): current + new */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
})

/** Admin reset another user's password */
export const adminResetPasswordSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
})

// ─── Report Schemas ───────────────────────────────────────────────────────

/** Generate report request */
export const generateReportSchema = z.object({
  type: z.string().min(1, 'Report type is required'),
  format: z.enum(['csv', 'xlsx', 'pdf'], {
    errorMap: () => ({ message: 'Format must be csv, xlsx, or pdf' }),
  }),
  params: z.record(z.unknown()).optional().default({}),
})

// ─── Financial Schemas ────────────────────────────────────────────────────

/** Create or update an invoice */
export const invoiceSchema = z.object({
  clientId: z.string().min(1, 'Client is required'),
  tripId: z.string().optional(),
  invoiceNumber: z.string().min(1, 'Invoice number is required'),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  items: z.array(
    z.object({
      description: z.string().min(1, 'Item description is required'),
      quantity: z.number().positive('Quantity must be positive'),
      unitPrice: z.number().nonnegative('Unit price must be non-negative'),
    })
  ).min(1, 'At least one invoice item is required'),
  taxRate: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
  status: z.enum(['draft', 'sent', 'paid', 'overdue', 'cancelled']).optional(),
})

/** Create a cash advance */
export const cashAdvanceSchema = z.object({
  driverId: z.string().min(1, 'Driver is required'),
  tripId: z.string().optional(),
  amount: z.number().positive('Amount must be positive'),
  reason: z.string().min(1, 'Reason is required'),
  requestDate: z.string().optional(),
})

/** Create an expense */
export const expenseSchema = z.object({
  tripId: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  description: z.string().min(1, 'Description is required'),
  amount: z.number().positive('Amount must be positive'),
  expenseDate: z.string().optional(),
  receiptUrl: z.string().optional(),
  vendor: z.string().optional(),
})

// ─── Socket.IO Event Schemas ─────────────────────────────────────────────

/** Driver location update event */
export const driverLocationSchema = z.object({
  driverId: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().min(0).max(359.99).optional(),
  speed: z.number().min(0).max(300).optional(),
  truckId: z.string().optional(),
  driverName: z.string().max(100).optional(),
})

/** Viewer subscribe event (array of driver IDs) */
export const viewerSubscribeSchema = z.array(z.string().min(1)).max(50, 'Cannot subscribe to more than 50 drivers')

// ─── Utility ───────────────────────────────────────────────────────────────

/** Helper to validate and parse a Zod schema, returning parsed data or error response */
export function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(body)
  if (result.success) {
    return { success: true, data: result.data }
  }
  const errors = result.error.issues.map((i) => i.message)
  return { success: false, errors }
}
