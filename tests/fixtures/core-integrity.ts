export const integrationActor = {
  userId: "integration-admin",
  email: "integration-admin@example.test",
  roleName: "Admin",
  permissions: [] as string[],
  driverId: null,
}

export function fixtureIdentity() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return {
    suffix,
    truckPlate: `IT-${suffix.slice(-6)}`.toUpperCase(),
    otherTruckPlate: `IW-${suffix.slice(-6)}`.toUpperCase(),
    driverPhone: `020${Math.floor(1000000 + Math.random() * 8999999)}`,
    employeeId: `INT-${suffix}`,
    licenseNumber: `LIC-${suffix}`,
  }
}
