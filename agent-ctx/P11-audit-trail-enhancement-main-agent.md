---
Task ID: P11-audit-trail-enhancement
Agent: Main Agent
Task: Enhance audit trail system with per-entity history, diff visualization, and full audit log browser

Work Log:
- Read worklog.md to understand project history, existing codebase patterns
- Read prisma/schema.prisma to confirm AuditLog model structure (id, userId, user relation, action, entity, entityId, details JSON string, ipAddress, createdAt)
- Read lib/auth-server.ts for requireAuth pattern
- Read lib/api.ts for apiFetch and existing interface patterns
- Read page.tsx and constants.ts to understand routing and navigation

- Created `src/app/api/audit-logs/route.ts`:
  - GET endpoint with requireAuth
  - Query params: entity, entityId, userId, action, dateFrom, dateTo, page, limit
  - Includes User relation for userName resolution
  - Paginated results sorted by createdAt DESC
  - Entity label resolution function: maps entity type + ID to human-readable labels (Truck→plateNumber (make model), Driver→firstName lastName, Trip→tripNumber, etc.)
  - Summary stats: byEntity, byAction, todayCount, mostActiveUser, mostActiveEntity
  - Details JSON parsed from string to structured object

- Created `src/app/api/audit-logs/entity/[entity]/[entityId]/route.ts`:
  - GET endpoint with requireAuth
  - URL params: entity type (validated against whitelist) + entityId
  - Returns ALL audit logs for entity sorted chronologically (asc for timeline)
  - Value label resolution for foreign keys: driverId→driver name, truckId→truck plate, userId→user name, clientId→company name
  - Timeline format with changes array, metadata (everything except 'changes')
  - Statistics: totalChanges, lastModified, modifiedBy (unique names), fieldChangeCount (sorted desc)
  - Proper cleanup pattern for cancelled requests

- Created `src/components/admin/AuditLogView.tsx`:
  - 'use client' with named export `export function AuditLogView()`
  - 4 summary cards: Total Events, Events Today, Most Active Entity, Most Active User
  - Filter bar: Entity dropdown, Action dropdown, User dropdown, Date from/to, Entity ID search, Reset button
  - Audit log table: expandable rows with Timestamp, User, Action badge, Entity (clickable), Details, IP
  - Action badges color-coded: create=emerald, update=amber, delete=red, login=sky
  - Expanded row shows: full timestamp, user info, IP, entity link, reason/notes callout, diff view
  - DiffView component: Field | Old Value (red strikethrough) → New Value (green)
  - Create actions: show all field values in table
  - Delete actions: show deleted data in red-bordered table
  - Entity History Dialog: full audit trail with timeline visualization (connected dots with lines), statistics sidebar
  - Responsive design with max-h-600px scrollable table
  - Dark mode support via Tailwind dark: classes
  - Loading skeleton states, error states with retry
  - Pagination controls (First, Prev, Next, Last)
  - Uses apiFetch from @/lib/api directly (no wrapper functions needed)
  - Fixed lint: avoided synchronous setState in effects using queueMicrotask pattern and inlined async fetch logic

- Did NOT modify any existing files (constants.ts, api.ts, page.tsx)
- `bun run lint` — zero errors
- Dev server running on port 3000 (HTTP 200)

Stage Summary:
- New: src/app/api/audit-logs/route.ts (GET with filters, pagination, summary stats)
- New: src/app/api/audit-logs/entity/[entity]/[entityId]/route.ts (per-entity timeline)
- New: src/components/admin/AuditLogView.tsx (comprehensive audit log viewer with diff visualization)
- All code linted (zero errors), dev server healthy
