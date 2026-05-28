# Task 4-b: Migrate TripDetailSheet and ExpenseDetailSheet to ResponsiveSheet

## Summary
Migrated two detail sheet components from standard shadcn `Sheet` to `ResponsiveSheet` for responsive behavior (desktop=right panel, mobile=full-screen).

## Files Modified

### 1. `src/components/trips/TripDetailSheet.tsx`
- Replaced `Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription` imports with `ResponsiveSheet` from `@/components/ui/responsive-sheet`
- Replaced `<Sheet open={...}>` + `<SheetContent>` + `<SheetHeader>` + `<SheetTitle>` + `<SheetDescription>` with `<ResponsiveSheet open={...} title={...} description={...} width="sm:max-w-lg">`
- Title includes Route icon + tripNumber in a span
- Description set to "Trip details and management"
- Body content wrapped in `<div className="space-y-5 p-4 md:p-6">` (inside AnimatePresence/motion.div)
- Removed `SheetContent` className (`sm:max-w-lg`) → passed via `width` prop
- Removed `SheetHeader`/`SheetTitle`/`SheetDescription` wrapper structure
- No `ResponsiveSheet.Footer` needed (actions are inline in body)
- No `SheetClose` buttons to remove (none existed)
- Preserved ALL existing functionality: image preview overlay, loading state, AnimatePresence animations, comments section, actions, fuel logs, etc.

### 2. `src/components/expenses/ExpenseDetailSheet.tsx`
- Replaced `Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription` imports with `ResponsiveSheet` from `@/components/ui/responsive-sheet`
- Replaced `<Sheet open={...}>` + `<SheetContent>` + `<SheetHeader>` + `<SheetTitle>` + `<SheetDescription>` with `<ResponsiveSheet open={...} title={...} description={...} width="sm:max-w-md">`
- Title includes Receipt icon + "Expense Details" in a span
- Description set to `expense.description`
- Body content wrapped in `<div className="space-y-5 p-4 md:p-6">`
- No `ResponsiveSheet.Footer` needed (no footer actions)
- No `SheetClose` buttons to remove (none existed)
- Preserved ALL existing functionality: status badge, truck info, expense details grid, InfoItem helper

## Migration Pattern Applied
Per the reference `InvoiceDetailSheet.tsx`:
1. ✅ Removed Sheet imports, added ResponsiveSheet import
2. ✅ Replaced Sheet JSX structure with ResponsiveSheet props (title, description, width)
3. ✅ Body content wrapped in `<div className="space-y-5 p-4 md:p-6">`
4. ✅ No ResponsiveSheet.Footer needed for either file
5. ✅ No SheetClose buttons existed to remove

## Notes
- Both files do NOT use `ResponsiveSheet.Footer` since they have no separate footer action area
- The ResponsiveSheet component already handles its own close button (X on desktop, back arrow on mobile)
- All business logic, data fetching, animations, and content preserved exactly
