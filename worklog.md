---
Task ID: 1
Agent: Main Agent
Task: Implement professional DVLA and Insurance renewal system with history tracking

Work Log:
- Analyzed current DVLA and Insurance page implementations
- Designed renewal system: update existing record + create history snapshot
- Added `DvlaRenewalHistory` and `InsuranceRenewalHistory` models to Prisma schema
- Added reverse relations on `DvlaRegistration` and `Insurance` models
- Generated Prisma client
- Created API routes: POST/GET `/api/dvla-registrations/[id]/renewals` and `/api/insurance/[id]/renewals`
- Created `DvlaRenewalDialog.tsx` component with pre-filled form for renewal
- Created `InsuranceRenewalDialog.tsx` component with pre-filled form for renewal
- Created `InsuranceDetailSheet.tsx` — full detail sheet with policy info, renewal button, history timeline
- Enhanced `DvlaDetailSheet.tsx` — added Renewal button, renewal history timeline
- Enhanced `InsuranceView.tsx` — added View button (Eye icon) with detail sheet, mobile View button
- All lint checks pass

Stage Summary:
- Renewal workflow: Updates existing record + saves JSON snapshot to history table
- DVLA page: Already had View button, now has Renewal button in detail sheet with history
- Insurance page: Now has View button + full detail sheet + Renewal button with history
- Database schema changes need to be pushed on VPS deployment (db:push)
- Files created: 4 new files, 3 modified files
