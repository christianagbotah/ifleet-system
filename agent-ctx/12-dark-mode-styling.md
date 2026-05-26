---
Task ID: 12
Agent: dark-mode-styling
Task: Add dark mode variants to all light-only classes across all pages

Work Log:
- DashboardPage.tsx: Added dark: variants to statusColors (pending/in_progress/completed/cancelled), DonutChart center circle (bg-white → dark:bg-slate-800), all 6 StatCard iconBg props, trip status legend segments, revenue overview gradient cards, View All button, Quick Action buttons
- DriversPage.tsx: Added dark: variants to statusColors (active/inactive/suspended), stats summary badges (Active/Inactive/Suspended)
- TrucksPage.tsx: Added dark: variants to statusColors (active/maintenance/out_of_service), status distribution cards (On Road/Maintenance/In Garage)
- CashAdvancesPage.tsx: Added dark: variants to statusColors (pending/approved/disbursed/settled), StatusTimeline circles/lines, summary cards, action button hover states
- IncentivesPage.tsx: Added dark: variants to statusColors, typeColors (performance/safety/bonus/overtime), StatusTimeline circles/lines, summary cards, action button hover states
- TripsPage.tsx: Added dark: variants to statusColors, amount calculation box
- WarehousesPage.tsx: Added dark: variants to Active/Inactive status badges
- ZoneRatesPage.tsx: Added dark: variants to Active/Inactive status badges
- ReportsPage.tsx: Verified already has dark mode variants
- SettingsPage.tsx: Verified already has dark mode variants

Stage Summary:
- 8 out of 10 page components updated (2 already had dark mode)
- Consistent pattern: bg-{color}-50 → dark:bg-{color}-900/20, text-{color}-700/800 → dark:text-{color}-400, border-{color}-200 → dark:border-{color}-800/50
- No new lint errors introduced
