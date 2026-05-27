# Task: Phase 5 - Driver Behaviour & Safety Scoring

## Work Log
- Read worklog.md to understand full project history (phases 1-6)
- Analyzed Prisma schema: Driver, Truck, TrackingAlert, TruckLocation, Trip, RoadworthyInspection models
- Analyzed existing code patterns: auth-server.ts requireAuth, apiFetch in api.ts, component patterns
- Created API route `src/app/api/drivers/safety-scores/route.ts`:
  - GET endpoint with requireAuth protection
  - Accepts query params: month (1-12), year, driverId (optional)
  - Scoring algorithm across 6 categories (0-100 total):
    1. Speeding (0-25 pts): based on TrackingAlert count with type='speeding'
    2. Route Compliance (0-20 pts): based on TrackingAlert count with type='route_deviation'
    3. Idle Time (0-15 pts): based on TrackingAlert count with type='idle'
    4. Late Night Driving (0-10 pts): based on TruckLocation entries between 22:00-05:00
    5. Compliance (0-20 pts): license expiry, ghana card expiry, verification status, truck insurance/roadworthy
    6. Trip Performance (0-10 pts): on-time completion rate
  - Trend calculation: compares current period score with previous month
  - Grade assignment: A+ (90+), A (80-89), B+ (70-79), B (60-69), C (50-59), D (40-49), F (<40)
  - Returns: drivers[], summary{}, leaderboard[]
- Created view component `src/components/drivers/SafetyScoringView.tsx`:
  - 'use client', responsive, dark mode support
  - Summary KPI cards (4): Average Fleet Score, Top Performer, Needs Attention, Monthly Trend
  - Month/Year selector with dropdowns
  - Two tabs: Leaderboard, Grade Distribution
  - Leaderboard: ranked list with medals for top 3, grade badges color-coded, trend icons
  - Driver detail panel on click: radar chart (6 categories), score breakdown table, trip stats, recent alerts
  - Grade Distribution tab: bar chart + summary table
  - Scoring criteria legend at bottom
  - CSV export functionality
  - Loading skeletons, error state, framer-motion animations
  - Uses Recharts (RadarChart, BarChart), shadcn/ui components
- Fixed TS18048: `alerts` possibly undefined → used nullish coalescing
- `bun run lint` — zero errors
- TypeScript type check — zero errors in new files
- Dev server healthy on port 3000 (HTTP 200)

## Files Created
- `src/app/api/drivers/safety-scores/route.ts` (API endpoint)
- `src/components/drivers/SafetyScoringView.tsx` (view component)

## No existing files modified (per requirements)
