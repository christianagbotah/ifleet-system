# Task 4-a: Migrate DriverDetailSheet and TruckDetailSheet to ResponsiveSheet

## Summary
Migrated two detail sheet components from standard shadcn `Sheet` to `ResponsiveSheet`, following the established pattern from `InvoiceDetailSheet.tsx`.

## Migration Pattern Applied
1. Replaced imports: Removed `Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription` from `@/components/ui/sheet` and `VisuallyHidden` from `@radix-ui/react-visually-hidden`. Added `import { ResponsiveSheet } from '@/components/ui/responsive-sheet'`
2. Replaced Sheet JSX structure with ResponsiveSheet:
   - `<Sheet open={...} onOpenChange={...}>` → `<ResponsiveSheet open={...} onOpenChange={...} title={...} description={...} width="sm:max-w-xl">`
   - SheetTitle content became the `title` prop (as computed ReactNode via helper function)
   - SheetDescription content became the `description` prop (as computed string via helper function)
   - Body content wrapped in `<div className="space-y-5 p-4 md:p-6">`
3. Used helper functions `getTitle()` and `getDescription()` to handle conditional title/description for loading/error/data states
4. Preserved `handleSheetClose` callback which resets state on close
5. No footer actions in either component, so `ResponsiveSheet.Footer` was not needed

## Files Modified

### 1. `src/components/drivers/DriverDetailSheet.tsx`
- Removed imports: Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, VisuallyHidden
- Added import: ResponsiveSheet
- Replaced `<Sheet>` + `<SheetContent>` with `<ResponsiveSheet>`
- Added `getTitle()` helper — returns "Driver Details" for loading/error, returns complex JSX (photo + name + status badge + truck plate) for driver data
- Added `getDescription()` helper — returns contextual description per state
- Body content wrapped in `<div className="space-y-5 p-4 md:p-6">` for each state branch
- All existing content preserved: key metrics grid, separator, tabs (Profile, Trips, Payroll, Documents)

### 2. `src/components/trucks/TruckDetailSheet.tsx`
- Removed imports: Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, VisuallyHidden
- Added import: ResponsiveSheet
- Replaced `<Sheet>` + `<SheetContent>` with `<ResponsiveSheet>`
- Added `getTitle()` helper — returns "Truck Details" for loading/error, returns JSX (truck icon + plate number) for truck data
- Added `getDescription()` helper — returns contextual description per state
- Body content wrapped in `<div className="space-y-5 p-4 md:p-6">` for each state branch
- All existing content preserved: key metrics grid, separator, tabs (Overview, Tyres, Service)

## Lint Status
- `bun run lint`: 0 errors
- Dev server compiles successfully
