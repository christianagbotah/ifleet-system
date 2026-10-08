export const DEMO_PROFILE_IDS = [
  'admin',
  'manager',
  'dispatcher',
  'driver',
  'mechanic',
  'accountant',
] as const

export type DemoProfileId = (typeof DEMO_PROFILE_IDS)[number]

export interface DemoProfile {
  id: DemoProfileId
  label: string
  shortLabel: string
  roleName: string
  description: string
  capability: string
}

export const DEMO_PROFILES: DemoProfile[] = [
  {
    id: 'admin',
    label: 'Administrator',
    shortLabel: 'Admin',
    roleName: 'Admin',
    description: 'See the full command center, governance and system configuration.',
    capability: 'Full oversight',
  },
  {
    id: 'manager',
    label: 'Fleet Manager',
    shortLabel: 'Manager',
    roleName: 'Manager',
    description: 'Review fleet operations, dispatch, compliance and performance.',
    capability: 'Operations control',
  },
  {
    id: 'dispatcher',
    label: 'Dispatcher',
    shortLabel: 'Dispatcher',
    roleName: 'Dispatcher',
    description: 'Explore load allocation, trips, drivers and dispatch workflows.',
    capability: 'Dispatch desk',
  },
  {
    id: 'driver',
    label: 'Driver',
    shortLabel: 'Driver',
    roleName: 'Driver',
    description: 'Preview the driver experience, assigned work and trip visibility.',
    capability: 'Driver portal',
  },
  {
    id: 'mechanic',
    label: 'Mechanic',
    shortLabel: 'Mechanic',
    roleName: 'Mechanic',
    description: 'Inspect maintenance, vehicle condition and workshop workflows.',
    capability: 'Workshop view',
  },
  {
    id: 'accountant',
    label: 'Accountant',
    shortLabel: 'Accountant',
    roleName: 'Accountant',
    description: 'Review expenses, payroll, invoices and financial reporting.',
    capability: 'Finance view',
  },
]

const PROFILE_ID_SET = new Set<string>(DEMO_PROFILE_IDS)

export function isDemoProfileId(value: unknown): value is DemoProfileId {
  return typeof value === 'string' && PROFILE_ID_SET.has(value)
}

export function getDemoProfile(profile: DemoProfileId): DemoProfile {
  return DEMO_PROFILES.find((item) => item.id === profile)!
}
