# Phase 8: Client Portal / Shipment Tracking

## Task
Create a Client Portal that allows clients to track their shipments in real-time, view delivery status, download waybills/invoices, and see their account overview.

## Files Created

### 1. API Route: `src/app/api/portal/client/[clientId]/route.ts`
- **GET endpoint** — No auth required (public, accessible via shareable link)
- Validates `clientId` exists and client is active
- Returns client dashboard data: client info, stats (total/active/completed/pending trips, revenue), active shipments with truck/driver/location, recent deliveries, and invoices
- Active trips include latest GPS location, progress percentage, delivery stops
- Progress calculated based on trip lifecycle stage (12 stages mapped to 0-100%)

### 2. API Route: `src/app/api/portal/shipment/[tripId]/route.ts`
- **GET endpoint** — No auth required
- Validates tripId belongs to a client (clientId required)
- Returns full shipment detail: trip info, truck, driver, delivery stops, timeline events, step-by-step visual timeline, route coordinates, latest GPS location
- Route coordinates sampled every 10th point to keep response size manageable
- Visual timeline steps: Scheduled → Loading → Loaded → Departed → In Transit → Arrived → Offloading → Offloaded → Return → Arrived Depot → Completed

### 3. View Component: `src/components/portal/ClientPortalView.tsx`
- **Named export**: `ClientPortalView`
- **Features**:
  - **Client Selector**: Searchable dropdown of all clients, "View Portal" button, "Copy Shareable Link" button
  - **Branded Header**: Amber gradient header with client company name, contact info, "Powered by iFleetPro" branding
  - **Stats Cards Row**: Total Shipments, In Transit, Completed, Total Value (GHS)
  - **Active Shipments Tab**: Cards with trip number badge, route visualization (origin → destination), cargo info, status badge (color-coded), progress bar, driver/truck info, ETA, "Track" button, live GPS update indicator
  - **Tracking Detail Dialog**: Full route visualization, step-by-step vertical timeline with completed/current/pending states, delivery stops with individual status, driver phone (clickable to call), truck plate, waiting reason banner
  - **Recent Deliveries Tab**: Paginated table with Trip #, Route, Cargo, Revenue, Delivered Date, Status
  - **Invoices Tab**: Cards with Invoice #, Date, Amount, Paid/Outstanding, Status, "Download PDF" placeholder button
  - **Help Footer**: Contact info (phone, email, address)
- **Styling**: 'use client', responsive mobile-first, framer-motion animations, amber accent theme, dark mode support, skeleton loading states

### 4. Wiring
- **page.tsx**: Added dynamic import for ClientPortalView + route case 'client-portal'
- **constants.ts**: Added Globe icon import + "Client Portal" nav entry in Main group
- **auth.ts**: Added 'client-portal' permission mapping (requires 'trips.view')

## Technical Notes
- Portal API endpoints use public fetch (no auth headers) since they're accessed via shareable links
- Client portal fetches client list via `apiFetch` (authenticated), but loads portal data via direct `fetch` (public endpoint)
- All existing files preserved — no modifications to api.ts, constants.ts nav items (only additions), or page.tsx structure
- `bun run lint` — zero errors
