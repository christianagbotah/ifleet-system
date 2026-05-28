# Task 4-c: Migrate Payroll, Maintenance & Tyre Detail Sheets to ResponsiveSheet

## Summary
Migrated 3 detail sheet components from standard shadcn `Sheet` to `ResponsiveSheet` for responsive behavior (desktop=right panel, mobile=full-screen page-push).

## Pattern Applied
Following the reference implementation in `InvoiceDetailSheet.tsx`:

1. **Imports**: Removed `Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter` from `@/components/ui/sheet`. Added `import { ResponsiveSheet } from '@/components/ui/responsive-sheet'`
2. **JSX Structure**: Replaced `<Sheet>` / `<SheetContent>` / `<SheetHeader>` / `<SheetTitle>` / `<SheetDescription>` with `<ResponsiveSheet>` using `title` and `description` props
3. **Body**: Wrapped all body content in `<div className="space-y-5 p-4 md:p-6">`
4. **Footer**: Used `<ResponsiveSheet.Footer>` for fixed footer actions, with namespace sub-component definition at bottom of file
5. **Removed**: `SheetClose` buttons (none present), `side` prop, `className` width (moved to `width` prop)

## Files Modified

### 1. `src/components/payroll/PayrollDetailSheet.tsx`
- **Before**: `<Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="bottom">`
- **After**: `<ResponsiveSheet open={open} onOpenChange={onOpenChange} title={...} description={...}>`
- **Title**: Driver name with Phone icon: `{record.driver.firstName} {record.driver.lastName}`
- **Description**: `record.driver.phone`
- **StatusBadge**: Moved from SheetHeader (alongside title) to top of body content to match reference pattern
- **Footer**: Used `ResponsiveSheet.Footer` wrapping Edit, Approve, Mark as Paid, Delete buttons
- **Added**: `ResponsiveSheet.Footer` namespace sub-component at bottom of file
- **Removed**: `side="bottom"` (ResponsiveSheet handles responsive behavior natively)
- **Preserved**: All business logic, DetailRow component, all button actions and conditional rendering

### 2. `src/components/maintenance/MaintenanceDetailSheet.tsx`
- **Before**: `<Sheet><SheetContent className="sm:max-w-md">`
- **After**: `<ResponsiveSheet ... width="sm:max-w-md">`
- **Title**: `{record.title}` with Wrench icon
- **Description**: `"Maintenance record details"`
- **No Footer**: Detail-only view, no action buttons in footer
- **Preserved**: All InfoItem helper component, all conditional rendering, formatting helpers

### 3. `src/components/tyres/TyreDetailSheet.tsx`
- **Before**: `<Sheet><SheetContent className="sm:max-w-lg">`
- **After**: `<ResponsiveSheet ...>` (default width `sm:max-w-lg`)
- **Title**: `"Tyre Details"` with CircleDot icon
- **Description**: `currentTyre.serialNumber`
- **Body**: Loading skeleton wrapped in `<div className="space-y-4 p-4 md:p-6">`, detail content wrapped in `<motion.div className="space-y-5 p-4 md:p-6">`
- **Removed**: `overflow-y-auto flex-1 min-h-0` from motion.div (ResponsiveSheet handles scrolling), `style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}`
- **Removed**: Individual `mx-5 sm:mx-6` margins from child elements (body wrapper now has `p-4 md:p-6`)
- **No Footer**: Action buttons are part of scrollable content
- **Preserved**: ChangeConditionDialog (Dialog component, unchanged), DetailCell helper, all state management, all conditional rendering, framer-motion animation

## Dev Server Status
- No compilation errors after migration
- Dev server running cleanly
