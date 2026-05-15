---
Task ID: 1
Agent: main
Task: Add fuel consumption tracking in monetary terms (GHS)

Work Log:
- Added `expectedFuelCost` (Float) field to ZoneRate model in prisma/schema.prisma
- Pushed schema to MySQL database with `prisma db push`
- Updated ZoneRatesView.tsx: added expectedFuelCost to ZoneRate interface, BulkRateRow interface, form state, resetForm, openEditDialog, handleSubmit
- Added expectedFuelCost column to desktop table header and cells
- Added expectedFuelCost to mobile cards with Banknote icon
- Updated single add/edit dialog (Row 2 now 4-col: Min Mileage | Max Mileage | Fuel Consumption | Fuel Cost)
- Updated bulk add dialog (Row 2 now 4-col grid)
- Updated bulk edit dialog (now 6-col grid on lg+)
- Updated bulk add/edit submit handlers to include expectedFuelCost
- Updated zone-rates API (route.ts, [id]/route.ts, bulk/route.ts) to handle expectedFuelCost
- Created fuel consumption analytics API at /api/fuel-consumption with byTruck, byZone, monthlyTrend data
- Created FuelConsumptionView component with KPI cards, by-truck/by-zone tables, monthly trend bars
- Added "Fuel Consumption" nav item under Finance section in constants.ts
- Added FuelConsumptionView dynamic import and routing in page.tsx
- Recovered source files from GitHub backup after subagent accidentally deleted src tree
- Ran lint - no errors

Stage Summary:
- ZoneRate model now has `expectedFuelCost` field for monetary fuel consumption per zone
- ZoneRatesView supports creating/editing/bulk operations with fuel cost
- New Fuel Consumption page (fuel-consumption nav) shows money-focused fuel analytics
- New API endpoint GET /api/fuel-consumption with truck, zone, and trend breakdowns

---
Task ID: 2
Agent: main
Task: UI fixes — bulk tyre modal size, sticky dialog footers, cursor pointer

Work Log:
- Fixed BulkTyreFormDialog: changed `max-w-5xl` (broken, overridden by dialog base `sm:max-w-lg`) to `md:max-w-4xl` (896px, slightly smaller than zone rate bulk edit's `md:max-w-5xl` = 1024px)
- Added global CSS rule in globals.css for sticky DialogFooter: `position: sticky; bottom: 0` on `[data-slot="dialog-footer"]` inside scrollable `[data-slot="dialog-content"]`
- Fixed 9 modals across 6 files with proper flex overflow pattern (DialogContent: flex flex-col overflow-hidden, body: flex-1 min-h-0 overflow-y-auto, footer: shrink-0):
  - InvoicesView.tsx (2 modals: create + view invoice)
  - DestinationZonesView.tsx (2 modals: bulk add + bulk edit zones)
  - ExpenseApprovalsView.tsx (2 modals: approve/reject + submit for approval)
  - UserFormDialog.tsx (1 modal: add/edit user)
  - BulkVerificationDialog.tsx (1 modal: added min-h-0 to DialogBody)
  - TripFormDialog.tsx (1 modal: fixed overflow pattern)
- Fixed responsive-dialog.tsx: changed from `overflow-y-auto` to `flex flex-col overflow-hidden`
- Cursor pointer was already applied globally via globals.css (confirmed no changes needed)

Stage Summary:
- Bulk tyre modal now renders at 896px (md:max-w-4xl) instead of 384px (sm:max-w-lg)
- All modals with overflow now keep Save/Cancel buttons pinned at bottom via sticky footer
- Lint passes clean, pushed to GitHub (commit 653c5a1)
