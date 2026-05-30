---
Task ID: 12
Agent: Validation Schema Agent
Task: Create comprehensive Zod validation schemas for server-side API input validation

Work Log:
- Read all 8 API route POST bodies to understand input shapes:
  - /api/trips/route.ts — complex nested schema (tripItems, deliveryDestinations)
  - /api/trucks/route.ts — vehicle data with enums (fuelType, status)
  - /api/drivers/route.ts — personal info + Ghana Card + account creation
  - /api/expenses/route.ts — expense tracking with categories
  - /api/fuel-logs/route.ts — fuel consumption logging (no /api/fuel exists)
  - /api/users/route.ts — user management with conditional email/password
  - /api/invoices/route.ts — invoice with nested items array
  - /api/maintenance/route.ts — maintenance record types
- Verified zod v4 import via `import { z } from 'zod/v4'` works correctly
- Created `/src/lib/validations.ts` with:
  - Common schemas: idSchema, emailSchema, phoneSchema, paginationSchema
  - Enum schemas: truckStatus, fuelType, expenseCategory, maintenanceType, etc.
  - 8 entity creation schemas matching API route input shapes
  - validateBody helper returning discriminated union { success, data/response }
  - validateQuery helper for URLSearchParams validation
  - All schemas use zod/v4 coerce for type-safe number/date parsing
- ESLint passes cleanly with zero errors

Stage Summary:
- File created: src/lib/validations.ts (~310 lines)
- 8 entity schemas: trip, truck, driver, expense, fuelLog, user, invoice, maintenance
- 4 common schemas: id, email, phone, pagination
- 2 helper functions: validateBody, validateQuery
- All schemas validated against actual API route POST body destructuring
