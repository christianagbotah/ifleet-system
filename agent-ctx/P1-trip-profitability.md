# Task: P1 - Trip Profitability Analysis

## Files Created

### 1. API Route: `src/app/api/trips/profitability/route.ts`
- **GET** endpoint with query params: `period`, `dateFrom`, `dateTo`, `truckId`, `driverId`, `route`, `clientId`, `page`, `limit`
- Auth via `requireAuth()` from `@/lib/auth-server`
- Period presets: `this_month`, `last_month`, `this_quarter`, `this_year`, `custom`
- Filters completed trips (offloaded, completed, arrived_depot) by departure time range
- For each trip, calculates:
  - Revenue from `trip.totalRevenue`
  - Fuel Cost from sum of `FuelLog.totalCost`
  - Other Expenses from `Expense.amount` (excluding fuel category)
  - Total Cost = Fuel + Other
  - Net Profit = Revenue - Total Cost
  - Margin % = (Net Profit / Revenue) * 100
- Returns paginated trip-level data + aggregations:
  - `summary`: totalRevenue, totalCost, totalProfit, avgMargin, profitableTrips, lossTrips, bestRoute, worstRoute
  - `byRoute`: grouped by loadingLocation → destination
  - `byTruck`: grouped by truck
  - `byClient`: grouped by client/customer
  - `monthlyTrend`: monthly revenue/cost/profit
- Handles null revenue (defaults to 0), edge cases
- No existing files modified

### 2. View Component: `src/components/analytics/ProfitabilityView.tsx`
- Exported as named export `ProfitabilityView`
- **Period selector**: This Month, Last Month, This Quarter, This Year, Custom Range
- **4 KPI Cards**: Total Revenue, Total Cost, Net Profit, Avg Margin — with color indicators (green=profit, red=loss)
- **Best/Worst Route cards**: visual indicators for most/least profitable routes
- **Tab 1 - Trip Breakdown**: Sortable table with Trip#, Date, Truck, Driver, Route, Revenue, Fuel, Expenses, Total Cost, Net Profit, Margin%. Paginated with navigation. Responsive column hiding.
- **Tab 2 - By Route**: Bar chart (Revenue vs Cost) using Recharts + sortable table. Loss-making routes highlighted in red with AlertTriangle icons.
- **Tab 3 - By Truck**: Horizontal bar chart (profit per truck, green/red) + sortable table. Loss-making trucks highlighted.
- **Tab 4 - Monthly Trend**: Line chart with 3 lines (Revenue, Cost, Profit). Also includes Client breakdown table below.
- Uses `apiFetch` from `@/lib/api`, `CURRENCY_SYMBOL` (₵) from `@/lib/constants`
- Loading skeleton states, empty states, error states
- Dark mode support via `dark:` Tailwind variants
- Responsive design (mobile-friendly with column hiding and wrapping)
- framer-motion animations for entrance transitions
- `bun run lint` — zero errors
- No existing files modified

## Notes
- No modifications to `src/lib/constants.ts`, `src/lib/api.ts`, or `src/app/page.tsx`
- The component is exported as a named export (`export function ProfitabilityView()`)
- To integrate into the app, add a navigation entry in constants.ts and a route case in page.tsx (not done per instructions)
