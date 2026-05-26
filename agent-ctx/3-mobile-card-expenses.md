---
Task ID: 3
Agent: Main
Task: Add mobile card view to ExpensesView following FuelLogsView pattern

Work Log:
- Read worklog.md for project context (Task ID 2 — mobile responsive overhaul reference)
- Analyzed FuelLogsView.tsx for the established mobile card pattern (hidden md:block table + md:hidden cards)
- Edited ExpensesView.tsx with 4 changes:
  1. Wrapped Import CSV + Export CSV buttons in `<div className="hidden sm:flex gap-2">` — hidden on mobile
  2. Added `hidden md:block` to the desktop table wrapper (`<div className="hidden md:block overflow-x-auto">`)
  3. Added fragment wrapper (`<>...</>`) around desktop table + mobile cards in the ternary branch
  4. Added mobile card view section with `md:hidden divide-y` containing:
     - Checkbox at top-left of each card (with `pt-0.5` alignment)
     - Truck plate number (bold, truncated) + StatusBadge (top-right)
     - Date (secondary text below truck name)
     - Category Badge + description text (truncated) on second row
     - Amount (bold, right-aligned) + View/Edit action buttons on third row
     - `mobile-card` CSS class for native-feel press animations
     - `min-h-[44px]` touch targets on action buttons
- Fixed parsing error (missing `<>` opening fragment tag)
- Ran lint — passes cleanly with zero errors/warnings

Stage Summary:
- ExpensesView now has responsive mobile card view matching FuelLogsView pattern
- Desktop table hidden on mobile (hidden md:block), mobile cards hidden on desktop (md:hidden)
- Import CSV / Export CSV buttons hidden on small screens (hidden sm:flex)
- Checkbox selection works on both mobile cards and desktop table rows
- Entity highlight scrolling works for mobile cards via ref
- All interactive elements meet 44px minimum touch target on mobile
