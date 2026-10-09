import { describe, expect, it } from 'vitest'
import { isTripFinancialSourceLocked } from '../expense-source-lock'

describe('reconciled expense source lock', () => {
  it('locks expense source mutations after an approved reconciliation exists', async () => {
    const client = { tripReconciliation: { findFirst: async () => ({ id: 'rec-1' }) } }
    await expect(isTripFinancialSourceLocked(client, 'trip-1')).resolves.toBe(true)
  })

  it('keeps unreconciled expense sources mutable', async () => {
    const client = { tripReconciliation: { findFirst: async () => null } }
    await expect(isTripFinancialSourceLocked(client, 'trip-1')).resolves.toBe(false)
  })

  it('does not lock expenses that are not attached to a trip', async () => {
    let queried = false
    const client = { tripReconciliation: { findFirst: async () => { queried = true; return null } } }
    await expect(isTripFinancialSourceLocked(client, null)).resolves.toBe(false)
    expect(queried).toBe(false)
  })
})
