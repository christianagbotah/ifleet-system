---
Task ID: 3a
Agent: core-infrastructure
Task: Build core infrastructure, navigation store, all API routes, middleware

Work Log:
- Created Zustand navigation store (src/lib/store.ts) with ViewName type and sidebar state management
- Created image upload utility (src/lib/upload.ts) with validation, compression, and base64 conversion
- Created middleware (src/middleware.ts) with security headers and in-memory rate limiting (100 req/min per IP)
- Created all 17 API route files:
  - POST /api/seed — Seeds 4 drivers, 6 trucks, 4 warehouses, 6 zone rates, 16 trips, 5 cash advances, 4 incentives (Ghana-based data)
  - GET/POST /api/drivers — List/search drivers, create driver with validation
  - GET/PUT/DELETE /api/drivers/[id] — Single driver ops with trip/cash advance/incentive counts, active trip protection
  - GET/POST /api/trucks — List/search/filter trucks, create truck
  - GET/PUT/DELETE /api/trucks/[id] — Single truck ops with trip count, active trip protection
  - GET/POST /api/warehouses — List warehouses, create warehouse
  - GET/PUT/DELETE /api/warehouses/[id] — Single warehouse with fromTrips/toTrips counts
  - GET/POST /api/zone-rates — List zone rates, create zone rate
  - GET/PUT/DELETE /api/zone-rates/[id] — Single zone rate ops
  - GET/POST /api/trips — List trips with relations + filters, create trip with auto-generated tripNumber (TRP-YYYYMMDD-XXX) and auto-calculated totalAmount
  - GET/PUT/DELETE /api/trips/[id] — Single trip ops with auto-recalculate totalAmount on update, transaction-safe delete
  - POST/DELETE /api/trips/[id]/images — Append/remove base64 images from trip.imageUrls JSON
  - GET/POST /api/cash-advances — List with filters, create with driver validation
  - GET/PUT/DELETE /api/cash-advances/[id] — Status workflow (pending→approved→disbursed→settled), pending-only delete
  - GET/POST /api/incentives — List with filters, create with driver + type validation
  - GET/PUT/DELETE /api/incentives/[id] — Status workflow (pending→approved→paid), pending-only delete
  - GET /api/dashboard — Aggregate stats: driver/truck counts, trip status breakdown, revenue totals, cash advance/incentive sums, recent trips, monthly metrics
- All routes use try/catch with proper error responses
- All routes use NextResponse.json() with appropriate status codes
- Prisma transactions used for trip deletion (cascading cash advances + incentives)
- ESLint passes with zero errors

Stage Summary:
- All 17 API route files created and lint-clean
- Zustand store ready for client-side navigation (exported: useAppStore, ViewName)
- Middleware with rate limiting and security headers in place
- Image upload utility with validation and compression ready
- Seed endpoint ready to populate database with realistic Ghana fleet data
- Dashboard API returns comprehensive aggregate statistics for the dashboard view
- All dynamic route params use Next.js 16 async params pattern: `params: Promise<{ id: string }>`
