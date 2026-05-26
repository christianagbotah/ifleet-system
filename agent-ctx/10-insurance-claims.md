---
Task ID: 10
Agent: Main Agent
Task: Implement Insurance Claims Tracker for iFleetPro

Work Log:
- Read worklog.md and CashAdvancesView.tsx for code patterns (imports, state management, API fetch pattern, UI layout)
- Found InsuranceClaim model already existed in prisma/schema.prisma with most fields
- Added missing fields: `assignedAdjuster` and `thirdPartyDetails` to the InsuranceClaim model
- Ran `npx prisma db push --accept-data-loss` to sync schema with MySQL
- Created API routes:
  - `src/app/api/insurance-claims/route.ts` — GET list with filters (status, claimType, insuranceId, truckId, search) + pagination + summary stats; POST create with auto-generated claim number (ICL-2025-XXXX)
  - `src/app/api/insurance-claims/[id]/route.ts` — GET detail with relations; PUT update fields or status transition (draft→submitted→under_review→approved/rejected→paid); DELETE (draft only)
- Added API client to `src/lib/api.ts`:
  - `InsuranceClaim` interface (all fields + truck, insurance, creator relations)
  - `InsuranceClaimSummary` interface (openCount, reviewCount, totalClaimed, totalApproved)
  - `fetchInsuranceClaims`, `fetchInsuranceClaim`, `createInsuranceClaim`, `updateInsuranceClaim`, `deleteInsuranceClaim`
- Added navigation entry to `src/lib/constants.ts`:
  - `{ id: "insurance-claims", label: "Insurance Claims", icon: ShieldAlert }` in Maintenance group
- Added NAV_PERMISSIONS entry in `src/lib/store/auth.ts`:
  - `'insurance-claims': ['maintenance.view']`
- Added dynamic import + route case in `src/app/page.tsx`:
  - `InsuranceClaimsView` dynamic import
  - `case 'insurance-claims':` route handler
- Created `src/components/insurance/InsuranceClaimsView.tsx` (~680 lines):
  - Summary cards: Open Claims, Under Review, Total Claimed, Total Approved
  - Tabs: All / Draft / Submitted / Review / Approved / Paid
  - Search bar with filter panel (truck plate, incident type)
  - Desktop: Responsive data table with claim#, truck, type, incident date, location, amount, status, actions columns
  - Mobile: Card layout with truncated info and status badge
  - Status badges: draft(gray), submitted(amber), under_review(sky), approved(emerald), rejected(red), paid(green)
  - Claim type icons: collision(Car/red), theft(User/purple), fire(Flame/orange), breakdown(Zap/amber), natural(Droplets/sky), vandalism(AlertCircle/rose), other(FileText/gray)
  - Create/Edit dialog: truck selector, insurance policy selector (auto-filtered by truck), incident type dropdown, incident date, location, description, claim amount, repair estimate, deductible, police report #, assigned adjuster, third party details, notes
  - Claim Detail Sheet (right side panel): financial summary card (amber gradient), truck/insurance info, incident details, description, third party details, notes/assessor notes, timeline (created/submitted/reviewed/approved/paid timestamps), action buttons for status progression
  - Status progression buttons: Submit → Start Review → Approve → Mark Paid (with Reject button at submitted/under_review)
  - Delete confirmation dialog (draft claims only)
  - Pagination controls with amber active page styling
- `bun run lint` — zero errors
- `npx prisma db push` — schema synced with MySQL
- `git commit && git push` — pushed to origin/main

Stage Summary:
- Modified: prisma/schema.prisma (added assignedAdjuster, thirdPartyDetails fields)
- New: src/app/api/insurance-claims/route.ts (GET list + POST create)
- New: src/app/api/insurance-claims/[id]/route.ts (GET detail + PUT update + DELETE)
- Modified: src/lib/api.ts (InsuranceClaim types + 5 API helper functions)
- Modified: src/lib/constants.ts (navigation entry in Maintenance group)
- Modified: src/lib/store/auth.ts (NAV_PERMISSIONS entry)
- Modified: src/app/page.tsx (dynamic import + route case)
- New: src/components/insurance/InsuranceClaimsView.tsx (full UI with form dialog + detail sheet)
- All code linted (zero errors), schema pushed, committed and pushed
