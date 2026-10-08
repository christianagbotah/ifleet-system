import type { DemoProfileId } from './demo-profiles'

export interface DemoIdentityConfig {
  email: string
  name: string
  roleName: string
  position: string
  department: string
  employeeNumber: string
}

const DEMO_IDENTITIES: Record<DemoProfileId, DemoIdentityConfig> = {
  admin: {
    email: 'demo.admin@ifleetpro.local',
    name: 'Demo Administrator',
    roleName: 'Admin',
    position: 'Demo System Administrator',
    department: 'Demo Management',
    employeeNumber: 'DEMO-ADM-001',
  },
  manager: {
    email: 'demo.manager@ifleetpro.local',
    name: 'Demo Fleet Manager',
    roleName: 'Manager',
    position: 'Demo Fleet Manager',
    department: 'Demo Operations',
    employeeNumber: 'DEMO-MGT-001',
  },
  dispatcher: {
    email: 'demo.dispatcher@ifleetpro.local',
    name: 'Demo Dispatcher',
    roleName: 'Dispatcher',
    position: 'Demo Dispatcher',
    department: 'Demo Operations',
    employeeNumber: 'DEMO-OPS-001',
  },
  driver: {
    email: 'demo.driver@ifleetpro.local',
    name: 'Demo Driver',
    roleName: 'Driver',
    position: 'Demo Driver',
    department: 'Demo Operations',
    employeeNumber: 'DEMO-DRV-USR-001',
  },
  mechanic: {
    email: 'demo.mechanic@ifleetpro.local',
    name: 'Demo Mechanic',
    roleName: 'Mechanic',
    position: 'Demo Workshop Technician',
    department: 'Demo Maintenance',
    employeeNumber: 'DEMO-MNT-001',
  },
  accountant: {
    email: 'demo.accountant@ifleetpro.local',
    name: 'Demo Accountant',
    roleName: 'Accountant',
    position: 'Demo Accountant',
    department: 'Demo Finance',
    employeeNumber: 'DEMO-FIN-001',
  },
}

export function getDemoIdentityConfig(profile: DemoProfileId): DemoIdentityConfig {
  return DEMO_IDENTITIES[profile]
}
