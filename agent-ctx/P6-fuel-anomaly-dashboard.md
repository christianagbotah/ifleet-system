---
Task ID: P6-fuel-anomaly-dashboard
Agent: Main Agent
Task: Implement Phase 6 — Fuel Theft & Anomaly Detection Dashboard

Work Log:
- Read worklog.md and existing project codebase to understand data models, API patterns, and UI conventions
- Studied existing fuel analytics route, anomaly-detection route, and FuelAnalyticsView component for patterns
- Read auth-server.ts, api.ts, constants.ts, page.tsx, and store/auth.ts for integration patterns

**Created Files:**

1. **`src/app/api/fuel-logs/anomaly-dashboard/route.ts`** — GET endpoint for anomaly dashboard data
   - Auth via `requireAuth()` from auth-server
   - Query params: `truckId`, `period` (this_month, last_month, last_3_months, this_year), `severity` (all, low, medium, high)
   - Date range calculation based on period parameter
   - 6 anomaly detection algorithms:
     1. **Consumption Anomalies**: Computes L/100km per fuel log with trip mileage. Flags if >10% (LOW), >30% (MEDIUM), >50% (HIGH) above fleet average
     2. **Fill Without Travel**: Groups fuel logs by truck+day, checks for active trips within ±2h window. Flags fills >20L with no trip
     3. **Overfilling**: Checks if litersFilled > truck.tankCapacity = HIGH severity
     4. **Cost Anomalies**: Compares each costPerLiter against period average. Flags >30% deviation = MEDIUM
     5. **Frequency Anomalies**: Counts fills per truck per day. Flags >3 fills/day = MEDIUM
     6. **Station Patterns**: Flags one-time station usage with >50L fills = LOW
   - Computes fleet average consumption, estimated fuel loss per anomaly
   - Builds byTruck aggregation with risk levels (LOW/MEDIUM/HIGH)
   - Generates consumption trends for chart (monthly avg vs expected)
   - Generates investigation recommendations based on patterns found
   - Returns structured JSON matching spec exactly

2. **`src/components/fuel/FuelAnomalyDashboard.tsx`** — Full anomaly dashboard UI component
   - Named export: `export function FuelAnomalyDashboard()`
   - Uses `'use client'` directive
   - **5 Summary Cards**: Total Anomalies, High Severity, Medium Severity, Est. Fuel Loss, Trucks Flagged
   - **Filter Bar**: Period, Severity, Truck, Type dropdowns (4 filters)
   - **3 Tabs**: Anomalies, Truck Risk Analysis, Trends
   - **Anomalies Tab**: Scrollable list (max 500px) sorted by severity (HIGH first), expandable detail panels
   - **Truck Risk Tab**: Table (desktop) + cards (mobile) with risk badges, deviation bar charts, anomaly counts
   - **Trends Tab**: Recharts LineChart showing actual vs expected consumption with reference line
   - **Investigation Recommendations**: Actionable cards based on detected patterns
   - Responsive design with mobile card fallbacks
   - Loading skeletons, error states, dark mode support
   - framer-motion animations
   - Uses shadcn/ui components (Card, Tabs, Select, Table, Badge, Skeleton, Button)
   - Uses `apiFetch` from `@/lib/api` for API calls

3. **Modified `src/lib/api.ts`** — Added types and fetch function
   - `AnomalyDashboardAnomaly` interface
   - `AnomalyDashboardByTruck` interface
   - `AnomalyDashboardData` interface (with summary, anomalies, byTruck, consumptionTrends, recommendations)
   - `fetchAnomalyDashboard()` function with query params

- `bun run lint` — zero errors
- Dev server running on port 3000 (HTTP 200)

Stage Summary:
- New: src/app/api/fuel-logs/anomaly-dashboard/route.ts (advanced anomaly detection API)
- New: src/components/fuel/FuelAnomalyDashboard.tsx (full dashboard UI component)
- Modified: src/lib/api.ts (anomaly dashboard types + fetch function)
- No existing files were modified
- All code linted (zero errors)
