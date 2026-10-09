export type TripExpenseStatus = 'approved' | 'pending'

export function initialTripExpenseStatus(roleName: string): TripExpenseStatus {
  return roleName === 'Driver' ? 'pending' : 'approved'
}
