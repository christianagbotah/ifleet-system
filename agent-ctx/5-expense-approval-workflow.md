---
Task ID: 5
Agent: Main Agent
Task: Implement Feature 5 — Expense Approval Workflow

Work Log:
- Read worklog.md and existing project patterns (Prisma MySQL, auth-server, shadcn/ui, api.ts conventions)
- Studied CashAdvancesView, TollTrackerView, page.tsx, auth-server, and api.ts for patterns

**Prisma Schema** (`prisma/schema.prisma`):
- Added `ExpenseApproval` model with fields: id, expenseId (unique relation to Expense), status (pending/approved/rejected/partial), requestedById, requestedBy (User relation), approvedById, approvedBy (User relation), approvalLevel (1/2/3), amount, approvedAmount, notes, rejectionReason, reviewedAt, createdAt, updatedAt
- Added `approval` relation to Expense model (one-to-one)
- Added `requestedApprovals` and `approvedExpenses` relations to User model
- Indexes on expenseId, status, requestedById, approvedById, createdAt

**API Routes** (`src/app/api/expense-approvals/`):
- `route.ts` — GET list with filters (status, expenseId, requestedById), pagination, summary stats (pendingCount, pendingAmount, approvedThisMonth, avgApprovalHours)
- `[id]/route.ts` — GET detail, PUT update status (approve/reject/partial with validation), DELETE pending approvals
- Auth: requireAuth + requireWriteAccess for POST/PUT/DELETE
- Audit logging for all mutations
- Updates Expense status and amount on approval/rejection

**API Client** (`src/lib/api.ts`):
- ExpenseApproval interface with full type definitions
- ExpenseApprovalSummary interface for summary stats
- fetchExpenseApprovals, fetchExpenseApproval, createExpenseApproval, updateExpenseApproval functions

**Navigation** (`src/lib/constants.ts`):
- Added `{ id: "expense-approvals", label: "Expense Approvals", icon: ClipboardCheck }` to Finance section
- Added ClipboardCheck import from lucide-react

**Page Routing** (`src/app/page.tsx`):
- Added dynamic import for ExpenseApprovalsView
- Added route case 'expense-approvals'

**Auth Permissions** (`src/lib/store/auth.ts`):
- Added `'expense-approvals': ['expenses.approve']` to NAV_PERMISSIONS

**View Component** (`src/components/finance/ExpenseApprovalsView.tsx` — ~920 lines:
- Summary cards: Pending Approval (amount + count), Approved This Month, Total Pending count, Avg Approval Time
- Tabs: All / Pending / Approved / Partial / Rejected
- Search across truck plate, category, description, requester name
- Desktop: Responsive data table with 8 columns
- Mobile: Card layout with compact info and action buttons
- ApprovalDialog: Supports approve, partial approve (with amount adjustment), reject (with reason) actions
- SubmitForApprovalDialog: Select approved expense, set approval level (1-3), add notes
- ApprovalDetailSheet: Full detail view with expense info, amounts, people, notes, rejection reason
- Status badges with amber/emerald/red/orange color scheme
- Pagination controls
- Empty states
- Error handling with loading states

- `prisma db push` — schema synced
- `bun run lint` — zero errors
- `git push` — committed and pushed

Stage Summary:
- New: prisma schema update (ExpenseApproval model + relations)
- New: src/app/api/expense-approvals/route.ts (GET list + POST create)
- New: src/app/api/expense-approvals/[id]/route.ts (GET, PUT, DELETE)
- New: src/components/finance/ExpenseApprovalsView.tsx (full UI)
- Modified: src/lib/api.ts (ExpenseApproval types + API helpers)
- Modified: src/lib/constants.ts (navigation entry with ClipboardCheck icon)
- Modified: src/lib/store/auth.ts (permission mapping)
- Modified: src/app/page.tsx (dynamic import + route case)
- All code linted (zero errors), schema pushed, committed and pushed
