# Task: Invoice PDF Generation & Download/Print

## Summary
Implemented complete invoice PDF generation, download, and print functionality across API endpoint, client helpers, and UI.

## Files Created
1. **`src/app/api/invoices/[id]/download/route.ts`** — New API endpoint
   - GET handler that generates an invoice PDF via `buildInvoicePdf()`
   - Auth via `requireAuth()`
   - Driver role access control (can only access their own trip invoices)
   - Saves report history entry to `ReportHistory` model
   - Returns PDF with proper `Content-Disposition` header: `attachment; filename="invoice_{number}_{date}.pdf"`
   - Proper error handling (404, 403, 500)

## Files Modified
2. **`src/lib/api.ts`** — Client-side helpers
   - `downloadInvoicePdf(invoiceId)`: Updated endpoint from `/api/reports/invoice-pdf?invoiceId=` to `/api/invoices/{id}/download`. Added Content-Disposition filename parsing for proper download names.
   - `previewInvoicePdf(invoiceId)`: New function — opens PDF in new browser tab for printing. Revokes blob URL after 60s delay.

3. **`src/components/invoices/InvoicesView.tsx`** — UI updates
   - Added `FileDown` and `Printer` icons from lucide-react
   - Added `previewInvoicePdf` import from api.ts
   - Removed unused `Download` and `Clock` imports
   - Added `handlePrint(invoice)` method — opens PDF in new tab with toast feedback
   - Updated dropdown menu: "Download PDF" now uses `FileDown` icon; added new "Print" menu item with `Printer` icon
   - Updated Invoice Detail Dialog footer: restructured to two-row layout with Download + Print buttons on the left, status actions on the right

## Pre-existing Files (No Changes Needed)
- `src/lib/reports/invoice-pdf.ts` — Already had a comprehensive PDF builder with header, client details, line items table, totals, payment status, notes, terms, footer, and page numbering. No changes needed.
- `src/lib/reports/waybill-pdf.ts` — Reference pattern used for API endpoint design
- `src/lib/reports/pdf-generator.ts` — Shared utilities (used by invoice-pdf.ts)

## Lint Result
`bun run lint` — Zero errors
