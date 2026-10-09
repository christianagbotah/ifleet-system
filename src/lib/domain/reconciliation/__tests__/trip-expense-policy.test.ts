import { describe, expect, it } from 'vitest'
import { initialTripExpenseStatus } from '../trip-expense-policy'

describe('trip expense approval policy', () => {
  it('requires driver-submitted expenses to await approval', () => {
    expect(initialTripExpenseStatus('Driver')).toBe('pending')
  })

  it('keeps authorized back-office expense entry approved', () => {
    expect(initialTripExpenseStatus('Admin')).toBe('approved')
    expect(initialTripExpenseStatus('Manager')).toBe('approved')
  })
})
