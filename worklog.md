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
