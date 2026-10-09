export const RECONCILED_FINANCIAL_SOURCE_LOCKED = 'RECONCILED_FINANCIAL_SOURCE_LOCKED'

export interface ReconciliationLookupClient {
  tripReconciliation: {
    findFirst(args: any): Promise<{ id: string } | null>
  }
}

export async function isTripFinancialSourceLocked(
  client: ReconciliationLookupClient,
  tripId: string | null | undefined,
): Promise<boolean> {
  if (!tripId) return false
  const approved = await client.tripReconciliation.findFirst({
    where: { tripId, status: 'approved' },
    select: { id: true },
    orderBy: { version: 'desc' },
  })
  return Boolean(approved)
}
