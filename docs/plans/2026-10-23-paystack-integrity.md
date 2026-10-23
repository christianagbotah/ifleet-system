# Fleetivo Paystack Charge Integrity Plan

**Goal:** Make Paystack customer invoice charges durable, idempotent, financially truthful, and safe under webhook/user-verification races.

## Scope
- Paystack transaction initialization supports customer invoice receipts only.
- Fleetivo creates a durable pending payment transaction before calling Paystack.
- A unique `(provider, reference)` constraint is the idempotency authority.
- Successful charge processing is centralized and shared by verify + webhook routes.
- Provider amount/currency/target mismatches are recorded for review and never mutate invoice balances.
- Applied invoice payments update `paidAmount` and use `partially_paid` / `paid` truthfully.
- Received customer money is not an Expense and is never assigned to an arbitrary truck.
- Driver/haulier payouts remain separate from charge collection and are not marked paid by a Paystack charge.

## TDD
1. Add schema/route contracts proving unique provider reference, invoice-only initialization, shared processor use, and absence of Expense/settlement side effects.
2. Add unit tests for first application, duplicate callbacks, provider mismatch, and already-paid invoice behavior.
3. Implement PaymentTransaction persistence and centralized Paystack charge processor.
4. Update initialize/verify/webhook routes.
5. Regenerate Prisma client; run focused + full CI gates; merge/deploy only after exact-head green.
