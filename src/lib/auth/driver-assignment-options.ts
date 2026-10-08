export interface DriverAssignmentOption {
  id: string
  label: string
  description?: string
}

const DEMO_DRIVER_ASSIGNMENT_OPTIONS: DriverAssignmentOption[] = [
  { id: 'demo-driver-kwame', label: 'Kwame Demo Driver', description: 'Primary haulage driver' },
  { id: 'demo-driver-ama', label: 'Ama Demo Driver', description: 'Relief haulage driver' },
  { id: 'demo-driver-kojo', label: 'Kojo Demo Driver', description: 'Long-haul driver' },
]

interface RealDriverLike {
  id: string
  firstName: string
  lastName: string
  phone?: string | null
}

export async function loadDriverAssignmentOptions(
  isDemo: boolean,
  loadRealDrivers: () => Promise<RealDriverLike[]>,
): Promise<DriverAssignmentOption[]> {
  if (isDemo) return DEMO_DRIVER_ASSIGNMENT_OPTIONS

  const drivers = await loadRealDrivers()
  return drivers.map((driver) => ({
    id: driver.id,
    label: `${driver.firstName} ${driver.lastName}`,
    description: driver.phone || undefined,
  }))
}
