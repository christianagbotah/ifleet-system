# Task ID: P2-Document-Expiry-Management
# Agent: Main Agent
# Task: Build Compliance Dashboard — unified expiry management center

## Work Log
- Read worklog.md to understand full project history (Phases 1-6+)
- Analyzed Prisma schema: Insurance (endDate), RoadworthyInspection (certificateExpiry), DvlaRegistration (expiryDate), Driver (licenseExpiry, ghanaCardExpiry)
- Read existing code patterns: requireAuth pattern from auth-server.ts, apiFetch/useApi from api.ts, framer-motion animations from RoadworthyView/CostAnalyticsView
- Created API route `src/app/api/compliance/expiry-dashboard/route.ts`:
  - GET with `daysAhead` query param (default 90)
  - Auth via requireAuth()
  - Queries 5 document types: Insurance (status=active, endDate), Roadworthy (certificateExpiry not null), DVLA (status=active, expiryDate), Driver Licenses (status=active, licenseExpiry), Ghana Cards (status=active, ghanaCardExpiry not null)
  - Calculates status: expired (<0d), critical (≤7d), warning (≤30d), valid (>30d)
  - Returns: summary, categories with per-category breakdown, allItems sorted by daysRemaining ASC
  - Each item includes: type, id, entityId, name, description, expiryDate, daysRemaining, status, entityLabel, actionUrl
- Created view component `src/components/compliance/ComplianceDashboardView.tsx`:
  - Named export: `ComplianceDashboardView`
  - Top section: 4 summary cards (Expired/Critical/Warning/Valid) with traffic light colors, icons, counts
  - Summary cards are clickable — filters the list below by status
  - Filter bar: Category dropdown (All/Insurance/Roadworthy/DVLA/Driver Licenses/Ghana Cards), Status dropdown, Days ahead input
  - Clear Filters button when any filter is active
  - Main list: Cards sorted by urgency (most urgent first) with:
    - Traffic light dot indicator (colored by status)
    - Type-specific icon (ShieldCheck/CarFront/FileCheck/Users/CreditCard)
    - Entity name + document description
    - Days remaining badge (colored by status, shows "Expired Xd ago" for past dates)
    - Expired items have red left border + subtle red background
    - Critical items have orange left border
  - Bottom section: Category compliance health breakdown
    - Overall compliance percentage with progress bar
    - Per-category horizontal bars with valid/total counts and percentages
    - Color-coded: green (≥80%), amber (≥50%), red (<50%)
  - Loading skeleton states, error state with retry, empty state for "all clear"
  - Dark mode support throughout
  - Responsive: 2-col grid on mobile for summary, stacking on small screens
  - Uses shadcn/ui: Card, Badge, Select, Button, Input, Progress, Skeleton, EmptyState
- Did NOT modify any existing files (page.tsx, constants.ts, api.ts all untouched)
- `bun run lint` — zero errors
- Dev server running on port 3000 (HTTP 200)

## Stage Summary
- New file: src/app/api/compliance/expiry-dashboard/route.ts
- New file: src/components/compliance/ComplianceDashboardView.tsx
- All code linted (zero errors)
- To integrate into navigation: add dynamic import + route case 'compliance-dashboard' in page.tsx, add nav entry in constants.ts
