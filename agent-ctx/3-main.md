---
Task ID: 3
Agent: Main Agent
Task: Add mobile card view to TrucksView following FuelLogsView pattern

Work Log:
- Read worklog.md for project context (iFleet fleet management Next.js project)
- Analyzed FuelLogsView.tsx mobile card pattern: hidden md:block desktop table + md:hidden mobile cards
- Analyzed TrucksView.tsx existing structure (597 lines, single desktop table with no mobile fallback)
- Applied 3 edits to TrucksView.tsx:
  1. Added `hidden sm:flex` to Import CSV and Export CSV buttons to hide them on mobile
  2. Wrapped desktop table `<div>` with `hidden md:block` class and added `<>` fragment wrapper around both desktop and mobile sections
  3. Added mobile card view section (`md:hidden divide-y`) with each truck rendered as a card containing:
     - Top row: bold plate number + make/model/year on left, status badge + checkbox on right
     - Middle row: driver name (or "Unassigned"), mileage (km), insurance status badge
     - Bottom row: View Details, Edit, Assign Driver action buttons with min-h-[44px] touch targets
     - Applied `mobile-card` CSS class to each card div
- Fixed JSX parsing error by wrapping desktop table + mobile cards in React fragment `<>...</>`
- Ran lint: TrucksView.tsx passes cleanly (pre-existing error in ExpensesView.tsx is unrelated)

Stage Summary:
- TrucksView now has responsive mobile card view matching FuelLogsView pattern
- Desktop table hidden on mobile, mobile cards hidden on desktop
- Import/Export CSV buttons hidden on mobile
- Checkbox selection preserved on mobile via top-right checkbox in each card
- All action buttons have min-h-[44px] for mobile touch targets
- Lint clean for TrucksView.tsx
