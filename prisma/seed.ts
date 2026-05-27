import { db } from '../src/lib/db';
import { hashPassword } from '../src/lib/auth-utils';

async function main() {
  console.log('🌱 Starting fleet management seed data...');

  // ============================================================
  // 1. ROLES
  // ============================================================
  console.log('\n📋 Creating roles...');

  const adminPermissions = JSON.stringify([
    'dashboard.view',
    'trucks.view', 'trucks.create', 'trucks.update', 'trucks.delete',
    'drivers.view', 'drivers.create', 'drivers.update', 'drivers.delete',
    'trips.view', 'trips.create', 'trips.update', 'trips.delete',
    'tyres.view', 'tyres.create', 'tyres.update', 'tyres.delete',
    'maintenance.view', 'maintenance.create', 'maintenance.update', 'maintenance.delete',
    'expenses.view', 'expenses.create', 'expenses.update', 'expenses.delete',
    'insurance.view', 'insurance.create', 'insurance.update', 'insurance.delete',
    'fuel.view', 'fuel.create', 'fuel.update', 'fuel.delete',
    'payroll.view', 'payroll.create', 'payroll.update', 'payroll.delete',
    'reports.view', 'reports.export',
    'users.view', 'users.create', 'users.update', 'users.delete',
    'roles.view', 'roles.create', 'roles.update', 'roles.delete',
    'settings.view', 'settings.update',
    'notifications.view', 'notifications.manage',
  ]);

  const managerPermissions = JSON.stringify([
    'dashboard.view',
    'trucks.view', 'trucks.create', 'trucks.update',
    'drivers.view', 'drivers.create', 'drivers.update',
    'trips.view', 'trips.create', 'trips.update',
    'tyres.view', 'tyres.create', 'tyres.update',
    'maintenance.view', 'maintenance.create', 'maintenance.update',
    'expenses.view', 'expenses.create', 'expenses.update',
    'insurance.view', 'insurance.create', 'insurance.update',
    'fuel.view', 'fuel.create', 'fuel.update',
    'payroll.view', 'payroll.create', 'payroll.update',
    'reports.view', 'reports.export',
    'notifications.view', 'notifications.manage',
  ]);

  const driverPermissions = JSON.stringify([
    'dashboard.view',
    'trips.view',
    'trips.view.own',
    'profile.view',
    'profile.update',
    'notifications.view',
    'settings.view',
  ]);

  const roles = await Promise.all([
    db.role.upsert({
      where: { name: 'Admin' },
      update: { permissions: adminPermissions, isSystem: true },
      create: {
        name: 'Admin',
        description: 'Full system access with all permissions',
        permissions: adminPermissions,
        isSystem: true,
      },
    }),
    db.role.upsert({
      where: { name: 'Manager' },
      update: { permissions: managerPermissions, isSystem: true },
      create: {
        name: 'Manager',
        description: 'Access to operational features excluding user management',
        permissions: managerPermissions,
        isSystem: true,
      },
    }),
    db.role.upsert({
      where: { name: 'Driver' },
      update: { permissions: driverPermissions, isSystem: true },
      create: {
        name: 'Driver',
        description: 'Limited access to own trips and profile',
        permissions: driverPermissions,
        isSystem: true,
      },
    }),
  ]);

  // Staff roles for non-driver employees
  const dispatcherPermissions = JSON.stringify([
    'dashboard.view',
    'trips.view', 'trips.create', 'trips.edit',
    'drivers.view',
    'trucks.view',
    'reports.view',
    'notifications.view',
  ]);

  const mechanicPermissions = JSON.stringify([
    'dashboard.view',
    'maintenance.view', 'maintenance.create', 'maintenance.edit',
    'trucks.view',
    'tyres.view',
    'fuel.view',
    'reports.view',
    'notifications.view',
  ]);

  const accountantPermissions = JSON.stringify([
    'dashboard.view',
    'expenses.view', 'expenses.create', 'expenses.edit', 'expenses.approve',
    'payroll.view', 'payroll.create', 'payroll.approve',
    'reports.view', 'reports.export',
    'invoices.view',
    'notifications.view',
  ]);

  const warehouseManagerPermissions = JSON.stringify([
    'dashboard.view',
    'trips.view', 'trips.edit',
    'trucks.view',
    'reports.view',
    'notifications.view',
  ]);

  const hrPermissions = JSON.stringify([
    'dashboard.view',
    'drivers.view', 'drivers.create', 'drivers.edit',
    'payroll.view',
    'reports.view', 'reports.export',
    'notifications.view',
  ]);

  const operationsManagerPermissions = JSON.stringify([
    'dashboard.view',
    'trucks.view', 'trucks.create', 'trucks.update',
    'drivers.view', 'drivers.create', 'drivers.update',
    'trips.view', 'trips.create', 'trips.update',
    'maintenance.view', 'maintenance.create', 'maintenance.update',
    'expenses.view', 'expenses.create', 'expenses.update',
    'fuel.view', 'fuel.create', 'fuel.update',
    'payroll.view', 'payroll.create', 'payroll.update',
    'reports.view', 'reports.export',
    'notifications.view', 'notifications.manage',
  ]);

  const staffRoles = await Promise.all([
    db.role.upsert({
      where: { name: 'Dispatcher' },
      update: { permissions: dispatcherPermissions, description: 'Manages trip assignments, driver scheduling, and dispatch operations' },
      create: {
        name: 'Dispatcher',
        description: 'Manages trip assignments, driver scheduling, and dispatch operations',
        permissions: dispatcherPermissions,
      },
    }),
    db.role.upsert({
      where: { name: 'Mechanic' },
      update: { permissions: mechanicPermissions, description: 'Manages vehicle maintenance, repairs, and workshop operations' },
      create: {
        name: 'Mechanic',
        description: 'Manages vehicle maintenance, repairs, and workshop operations',
        permissions: mechanicPermissions,
      },
    }),
    db.role.upsert({
      where: { name: 'Accountant' },
      update: { permissions: accountantPermissions, description: 'Manages expenses, payroll, invoices, and financial reporting' },
      create: {
        name: 'Accountant',
        description: 'Manages expenses, payroll, invoices, and financial reporting',
        permissions: accountantPermissions,
      },
    }),
    db.role.upsert({
      where: { name: 'Warehouse Manager' },
      update: { permissions: warehouseManagerPermissions, description: 'Manages warehouse inventory, loading, and offloading operations' },
      create: {
        name: 'Warehouse Manager',
        description: 'Manages warehouse inventory, loading, and offloading operations',
        permissions: warehouseManagerPermissions,
      },
    }),
    db.role.upsert({
      where: { name: 'HR' },
      update: { permissions: hrPermissions, description: 'Manages driver records, hiring, onboarding, and employee data' },
      create: {
        name: 'HR',
        description: 'Manages driver records, hiring, onboarding, and employee data',
        permissions: hrPermissions,
      },
    }),
    db.role.upsert({
      where: { name: 'Operations Manager' },
      update: { permissions: operationsManagerPermissions, description: 'Oversees all daily operations, trips, and fleet coordination' },
      create: {
        name: 'Operations Manager',
        description: 'Oversees all daily operations, trips, and fleet coordination',
        permissions: operationsManagerPermissions,
      },
    }),
  ]);

  console.log(`  ✅ Created 3 system roles: Admin, Manager, Driver`);
  console.log(`  ✅ Created 6 staff roles: Dispatcher, Mechanic, Accountant, Warehouse Manager, HR, Operations Manager`);

  const [adminRole, managerRole, driverRole] = roles;
  const [dispatcherRole, mechanicRole, accountantRole, warehouseRole, hrRole, opsManagerRole] = staffRoles;

  // ============================================================
  // 2. USERS
  // ============================================================
  console.log('\n👤 Creating users...');

  const adminUser = await db.user.upsert({
    where: { email: 'admin@fleetpro.com.gh' },
    update: {},
    create: {
      email: 'admin@fleetpro.com.gh',
      name: 'Kwame Asante',
      phone: '+233240000001',
      password: await hashPassword('admin123'),
      roleId: adminRole.id,
      isActive: true,
      lastLogin: new Date('2025-01-10T08:30:00'),
    },
  });

  const managerUser = await db.user.upsert({
    where: { email: 'manager@fleetpro.com.gh' },
    update: {},
    create: {
      email: 'manager@fleetpro.com.gh',
      name: 'Ama Mensah',
      phone: '+233240000002',
      password: await hashPassword('manager123'),
      roleId: managerRole.id,
      isActive: true,
      lastLogin: new Date('2025-01-10T09:00:00'),
    },
  });

  const driverUser1 = await db.user.upsert({
    where: { email: 'driver1@fleetpro.com.gh' },
    update: {},
    create: {
      email: 'driver1@fleetpro.com.gh',
      name: 'Kofi Boateng',
      phone: '+233240000003',
      password: await hashPassword('driver123'),
      roleId: driverRole.id,
      isActive: true,
      lastLogin: new Date('2025-01-09T06:15:00'),
    },
  });

  const driverUser2 = await db.user.upsert({
    where: { email: 'driver2@fleetpro.com.gh' },
    update: {},
    create: {
      email: 'driver2@fleetpro.com.gh',
      name: 'Emmanuel Owusu',
      phone: '+233240000004',
      password: await hashPassword('driver123'),
      roleId: driverRole.id,
      isActive: true,
      lastLogin: new Date('2025-01-08T05:45:00'),
    },
  });

  // Staff users (non-driver employees)
  const staffUsers = await Promise.all([
    db.user.upsert({
      where: { email: 'dispatcher@fleetpro.com.gh' },
      update: {},
      create: {
        email: 'dispatcher@fleetpro.com.gh',
        name: 'Abena Serwah',
        phone: '+233240000005',
        password: await hashPassword('staff123'),
        roleId: dispatcherRole.id,
        position: 'Lead Dispatcher',
        department: 'Operations',
        employeeNumber: 'EMP-OPS-001',
        isActive: true,
        lastLogin: new Date('2025-01-10T07:00:00'),
      },
    }),
    db.user.upsert({
      where: { email: 'mechanic@fleetpro.com.gh' },
      update: {},
      create: {
        email: 'mechanic@fleetpro.com.gh',
        name: 'Kwabena Darko',
        phone: '+233240000006',
        password: await hashPassword('staff123'),
        roleId: mechanicRole.id,
        position: 'Head Mechanic',
        department: 'Maintenance',
        employeeNumber: 'EMP-MNT-001',
        isActive: true,
        lastLogin: new Date('2025-01-09T08:30:00'),
      },
    }),
    db.user.upsert({
      where: { email: 'accountant@fleetpro.com.gh' },
      update: {},
      create: {
        email: 'accountant@fleetpro.com.gh',
        name: 'Efua Agyeman',
        phone: '+233240000007',
        password: await hashPassword('staff123'),
        roleId: accountantRole.id,
        position: 'Senior Accountant',
        department: 'Finance',
        employeeNumber: 'EMP-FIN-001',
        isActive: true,
        lastLogin: new Date('2025-01-10T09:15:00'),
      },
    }),
  ]);

  // Update existing admin/manager with position & department
  await db.user.update({
    where: { id: adminUser.id },
    data: { position: 'System Administrator', department: 'Management', employeeNumber: 'EMP-MGT-001' },
  });
  await db.user.update({
    where: { id: managerUser.id },
    data: { position: 'Fleet Manager', department: 'Management', employeeNumber: 'EMP-MGT-002' },
  });

  console.log(`  ✅ Created 7 users: admin, manager, 2 drivers, dispatcher, mechanic, accountant`);

  // ============================================================
  // 3. DRIVERS
  // ============================================================
  console.log('\n🚛 Creating drivers...');

  const drivers = await Promise.all([
    db.driver.upsert({
      where: { licenseNumber: 'DV-GH-2019-45821' },
      update: {},
      create: {
        userId: driverUser1.id,
        employeeId: 'FP-DRV-001',
        firstName: 'Kofi',
        lastName: 'Boateng',
        phone: '+233243567890',
        email: 'kofi.boateng@fleetpro.com.gh',
        dateOfBirth: new Date('1985-03-22'),
        address: '12 Mantse Agbona Street, Accra',
        photo: null,
        ghanaCardNumber: 'GHA-123456789-0',
        ghanaCardExpiry: new Date('2035-03-22'),
        ghanaCardFrontImage: null,
        ghanaCardBackImage: null,
        licenseNumber: 'DV-GH-2019-45821',
        licenseExpiry: new Date('2027-06-15'),
        licenseClass: 'C',
        licenseImage: null,
        emergencyName: 'Akosua Boateng',
        emergencyPhone: '+233205678901',
        verificationStatus: 'verified',
        rating: 4.8,
        status: 'active',
        totalTrips: 156,
        totalMileage: 245000,
        hireDate: new Date('2019-09-01'),
      },
    }),
    db.driver.upsert({
      where: { licenseNumber: 'DV-GH-2020-67234' },
      update: {},
      create: {
        userId: driverUser2.id,
        employeeId: 'FP-DRV-002',
        firstName: 'Emmanuel',
        lastName: 'Owusu',
        phone: '+233207891234',
        email: 'emmanuel.owusu@fleetpro.com.gh',
        dateOfBirth: new Date('1990-07-14'),
        address: '45 Kwame Nkrumah Avenue, Kumasi',
        photo: null,
        ghanaCardNumber: 'GHA-234567890-1',
        ghanaCardExpiry: new Date('2035-07-14'),
        ghanaCardFrontImage: null,
        ghanaCardBackImage: null,
        licenseNumber: 'DV-GH-2020-67234',
        licenseExpiry: new Date('2028-03-10'),
        licenseClass: 'C',
        licenseImage: null,
        emergencyName: 'Grace Owusu',
        emergencyPhone: '+233208912345',
        verificationStatus: 'pending',
        rating: 4.5,
        status: 'active',
        totalTrips: 98,
        totalMileage: 156000,
        hireDate: new Date('2020-06-15'),
      },
    }),
    db.driver.upsert({
      where: { licenseNumber: 'DV-GH-2018-32156' },
      update: {},
      create: {
        employeeId: 'FP-DRV-003',
        firstName: 'Yaw',
        lastName: 'Adjei',
        phone: '+233244567801',
        email: 'yaw.adjei@fleetpro.com.gh',
        dateOfBirth: new Date('1982-11-05'),
        address: '78 Ring Road Central, Tamale',
        photo: null,
        ghanaCardNumber: 'GHA-345678901-2',
        ghanaCardExpiry: new Date('2035-11-05'),
        ghanaCardFrontImage: null,
        ghanaCardBackImage: null,
        licenseNumber: 'DV-GH-2018-32156',
        licenseExpiry: new Date('2026-11-20'),
        licenseClass: 'C',
        licenseImage: null,
        emergencyName: 'Abena Adjei',
        emergencyPhone: '+233205678012',
        verificationStatus: 'pending',
        rating: 4.9,
        status: 'active',
        totalTrips: 210,
        totalMileage: 340000,
        hireDate: new Date('2018-01-10'),
      },
    }),
    db.driver.upsert({
      where: { licenseNumber: 'DV-GH-2021-78902' },
      update: {},
      create: {
        employeeId: 'FP-DRV-004',
        firstName: 'Joseph',
        lastName: 'Amoako',
        phone: '+233205678923',
        dateOfBirth: new Date('1993-01-18'),
        photo: null,
        ghanaCardNumber: 'GHA-456789012-3',
        ghanaCardExpiry: new Date('2035-01-18'),
        ghanaCardFrontImage: null,
        ghanaCardBackImage: null,
        licenseNumber: 'DV-GH-2021-78902',
        licenseExpiry: new Date('2029-08-30'),
        licenseClass: 'C',
        licenseImage: null,
        emergencyName: 'Felicia Amoako',
        emergencyPhone: '+233246789034',
        address: '23 Liberation Road, Accra',
        verificationStatus: 'pending',
        rating: 4.3,
        status: 'active',
        totalTrips: 67,
        totalMileage: 98000,
        hireDate: new Date('2021-03-01'),
      },
    }),
    db.driver.upsert({
      where: { licenseNumber: 'DV-GH-2017-15489' },
      update: {},
      create: {
        employeeId: 'FP-DRV-005',
        firstName: 'Kwabena',
        lastName: 'Dankwah',
        phone: '+233247890145',
        email: 'kwabena.dankwah@fleetpro.com.gh',
        dateOfBirth: new Date('1980-09-28'),
        address: '9 Harbour Road, Tema',
        photo: null,
        ghanaCardNumber: 'GHA-567890123-4',
        ghanaCardExpiry: new Date('2035-09-28'),
        ghanaCardFrontImage: null,
        ghanaCardBackImage: null,
        licenseNumber: 'DV-GH-2017-15489',
        licenseExpiry: new Date('2026-04-12'),
        licenseClass: 'C',
        licenseImage: null,
        emergencyName: 'Esi Dankwah',
        emergencyPhone: '+233208901256',
        verificationStatus: 'pending',
        rating: 4.7,
        status: 'active',
        totalTrips: 289,
        totalMileage: 478000,
        hireDate: new Date('2017-04-15'),
      },
    }),
    db.driver.upsert({
      where: { licenseNumber: 'DV-GH-2022-90127' },
      update: {},
      create: {
        employeeId: 'FP-DRV-006',
        firstName: 'Samuel',
        lastName: 'Tetteh',
        phone: '+233268901267',
        dateOfBirth: new Date('1995-05-10'),
        photo: null,
        ghanaCardNumber: 'GHA-678901234-5',
        ghanaCardExpiry: new Date('2035-05-10'),
        ghanaCardFrontImage: null,
        ghanaCardBackImage: null,
        licenseNumber: 'DV-GH-2022-90127',
        licenseExpiry: new Date('2030-12-05'),
        licenseClass: 'C',
        licenseImage: null,
        emergencyName: 'Victoria Tetteh',
        emergencyPhone: '+233209012378',
        address: '56 Spintex Road, Accra',
        verificationStatus: 'verified',
        rating: 4.6,
        status: 'active',
        totalTrips: 42,
        totalMileage: 65000,
        hireDate: new Date('2022-08-20'),
      },
    }),
  ]);

  const [driver1, driver2, driver3, driver4, driver5, driver6] = drivers;
  console.log(`  ✅ Created ${drivers.length} drivers`);

  // ============================================================
  // 4. TRUCKS
  // ============================================================
  console.log('\n🚚 Creating trucks...');

  const trucks = await Promise.all([
    db.truck.upsert({
      where: { plateNumber: 'GT-4521-AB' },
      update: {},
      create: {
        plateNumber: 'GT-4521-AB',
        make: 'Mercedes-Benz',
        model: 'Actros 2548',
        year: 2021,
        vinNumber: 'WDB9348021S482910',
        engineNumber: 'OM471LA-7829456',
        chassisNumber: 'WDB9348021S482910',
        color: 'White',
        fuelType: 'Diesel',
        tankCapacity: 400,
        status: 'active',
        currentMileage: 145230,
        driverId: driver1.id,
        notes: 'Main Accra-Kumasi route truck',
        insuranceStatus: 'active',
        nextServiceDate: new Date('2025-02-15'),
      },
    }),
    db.truck.upsert({
      where: { plateNumber: 'GT-7834-CV' },
      update: {},
      create: {
        plateNumber: 'GT-7834-CV',
        make: 'MAN',
        model: 'TGX 29.480',
        year: 2020,
        vinNumber: 'WMA294800020L78345',
        engineNumber: 'D2676LF-4567123',
        chassisNumber: 'WMA294800020L78345',
        color: 'Blue',
        fuelType: 'Diesel',
        tankCapacity: 450,
        status: 'active',
        currentMileage: 198450,
        driverId: driver2.id,
        notes: 'Long-distance haulage unit',
        insuranceStatus: 'active',
        nextServiceDate: new Date('2025-03-01'),
      },
    }),
    db.truck.upsert({
      where: { plateNumber: 'GT-2156-DF' },
      update: {},
      create: {
        plateNumber: 'GT-2156-DF',
        make: 'DAF',
        model: 'XF 480',
        year: 2022,
        vinNumber: 'XLDFA4800021N21560',
        engineNumber: 'MX13-5678934',
        chassisNumber: 'XLDFA4800021N21560',
        color: 'Silver',
        fuelType: 'Diesel',
        tankCapacity: 420,
        status: 'active',
        currentMileage: 89720,
        driverId: driver3.id,
        notes: 'Newer unit, regional routes',
        insuranceStatus: 'active',
        nextServiceDate: new Date('2025-04-10'),
      },
    }),
    db.truck.upsert({
      where: { plateNumber: 'GT-5689-ER' },
      update: {},
      create: {
        plateNumber: 'GT-5689-ER',
        make: 'Volvo',
        model: 'FH 500',
        year: 2019,
        vinNumber: 'YV2RT40A0L5629340',
        engineNumber: 'D13C-7890456',
        chassisNumber: 'YV2RT40A0L5629340',
        color: 'Red',
        fuelType: 'Diesel',
        tankCapacity: 380,
        status: 'maintenance',
        currentMileage: 267890,
        driverId: driver4.id,
        notes: 'Engine overhaul in progress at KOF Motors',
        insuranceStatus: 'active',
        nextServiceDate: new Date('2025-01-20'),
      },
    }),
    db.truck.upsert({
      where: { plateNumber: 'GT-9012-GH' },
      update: {},
      create: {
        plateNumber: 'GT-9012-GH',
        make: 'Mercedes-Benz',
        model: 'Actros 1845',
        year: 2018,
        vinNumber: 'WDB1845018K901245',
        engineNumber: 'OM457LA-3456789',
        chassisNumber: 'WDB1845018K901245',
        color: 'White',
        fuelType: 'Diesel',
        tankCapacity: 350,
        status: 'active',
        currentMileage: 321450,
        driverId: driver5.id,
        notes: 'Veteran truck, well maintained',
        insuranceStatus: 'active',
        nextServiceDate: new Date('2025-02-28'),
      },
    }),
    db.truck.upsert({
      where: { plateNumber: 'GT-3345-HJ' },
      update: {},
      create: {
        plateNumber: 'GT-3345-HJ',
        make: 'MAN',
        model: 'TGX 28.440',
        year: 2023,
        vinNumber: 'WMA2844023P334567',
        engineNumber: 'D2066LF-6789012',
        chassisNumber: 'WMA2844023P334567',
        color: 'Green',
        fuelType: 'Diesel',
        tankCapacity: 460,
        status: 'active',
        currentMileage: 45670,
        driverId: driver6.id,
        notes: 'Brand new addition to fleet, Tema-Bolgatanga route',
        insuranceStatus: 'active',
        nextServiceDate: new Date('2025-06-01'),
      },
    }),
    db.truck.upsert({
      where: { plateNumber: 'GT-6778-KL' },
      update: {},
      create: {
        plateNumber: 'GT-6778-KL',
        make: 'Volvo',
        model: 'FH 460',
        year: 2020,
        vinNumber: 'YV2RT40B0J6778123',
        engineNumber: 'D13C-2345678',
        chassisNumber: 'YV2RT40B0J6778123',
        color: 'Black',
        fuelType: 'Diesel',
        tankCapacity: 400,
        status: 'active',
        currentMileage: 178900,
        driverId: null,
        notes: 'Spare truck, no permanent driver assigned',
        insuranceStatus: 'active',
        nextServiceDate: new Date('2025-03-15'),
      },
    }),
    db.truck.upsert({
      where: { plateNumber: 'GT-8901-MN' },
      update: {},
      create: {
        plateNumber: 'GT-8901-MN',
        make: 'DAF',
        model: 'CF 450',
        year: 2017,
        vinNumber: 'XLDCF450017M890198',
        engineNumber: 'MX11-9012345',
        chassisNumber: 'XLDCF450017M890198',
        color: 'Orange',
        fuelType: 'Diesel',
        tankCapacity: 350,
        status: 'maintenance',
        currentMileage: 389200,
        driverId: null,
        notes: 'Brake system overhaul at Tema workshop',
        insuranceStatus: 'expired',
        nextServiceDate: new Date('2025-01-25'),
      },
    }),
  ]);

  const [truck1, truck2, truck3, truck4, truck5, truck6, truck7, truck8] = trucks;
  console.log(`  ✅ Created ${trucks.length} trucks`);

  // ============================================================
  // 5. TYRES
  // ============================================================
  console.log('\n🛞 Creating tyres...');

  const tyreData = [
    // Truck 1: GT-4521-AB (Mercedes Actros) - 4 tyres
    { truckId: truck1.id, serialNumber: 'MCH-2024-001', brand: 'Michelin', purchaseDate: new Date('2024-03-15'), purchasePrice: 2800, condition: 'good', lastInspection: new Date('2025-01-05') },
    { truckId: truck1.id, serialNumber: 'MCH-2024-002', brand: 'Michelin', purchaseDate: new Date('2024-03-15'), purchasePrice: 2800, condition: 'good', lastInspection: new Date('2025-01-05') },
    { truckId: truck1.id, serialNumber: 'CNT-2024-015', brand: 'Continental', purchaseDate: new Date('2024-01-10'), purchasePrice: 3200, condition: 'good', lastInspection: new Date('2025-01-05') },
    { truckId: truck1.id, serialNumber: 'CNT-2024-016', brand: 'Continental', purchaseDate: new Date('2024-01-10'), purchasePrice: 3200, condition: 'fair', lastInspection: new Date('2025-01-05') },

    // Truck 2: GT-7834-CV (MAN TGX) - 4 tyres
    { truckId: truck2.id, serialNumber: 'DLP-2024-003', brand: 'Dunlop', purchaseDate: new Date('2024-06-20'), purchasePrice: 2500, condition: 'good', lastInspection: new Date('2025-01-08') },
    { truckId: truck2.id, serialNumber: 'DLP-2024-004', brand: 'Dunlop', purchaseDate: new Date('2024-06-20'), purchasePrice: 2500, condition: 'good', lastInspection: new Date('2025-01-08') },
    { truckId: truck2.id, serialNumber: 'MCH-2023-089', brand: 'Michelin', purchaseDate: new Date('2023-09-05'), purchasePrice: 3200, condition: 'fair', lastInspection: new Date('2025-01-08') },
    { truckId: truck2.id, serialNumber: 'MCH-2023-090', brand: 'Michelin', purchaseDate: new Date('2023-09-05'), purchasePrice: 3200, condition: 'worn', lastInspection: new Date('2025-01-08'), notes: 'Schedule replacement soon' },

    // Truck 3: GT-2156-DF (DAF XF) - 4 tyres
    { truckId: truck3.id, serialNumber: 'CNT-2024-045', brand: 'Continental', purchaseDate: new Date('2024-08-12'), purchasePrice: 2900, condition: 'new', lastInspection: new Date('2025-01-10') },
    { truckId: truck3.id, serialNumber: 'CNT-2024-046', brand: 'Continental', purchaseDate: new Date('2024-08-12'), purchasePrice: 2900, condition: 'new', lastInspection: new Date('2025-01-10') },
    { truckId: truck3.id, serialNumber: 'MCH-2024-051', brand: 'Michelin', purchaseDate: new Date('2024-09-01'), purchasePrice: 3300, condition: 'good', lastInspection: new Date('2025-01-10') },
    { truckId: truck3.id, serialNumber: 'MCH-2024-052', brand: 'Michelin', purchaseDate: new Date('2024-09-01'), purchasePrice: 3300, condition: 'good', lastInspection: new Date('2025-01-10') },

    // Truck 4: GT-5689-ER (Volvo FH) - 4 tyres
    { truckId: truck4.id, serialNumber: 'DLP-2022-034', brand: 'Dunlop', purchaseDate: new Date('2022-11-20'), purchasePrice: 2400, condition: 'worn', lastInspection: new Date('2025-01-02'), notes: 'Needs immediate replacement' },
    { truckId: truck4.id, serialNumber: 'DLP-2022-035', brand: 'Dunlop', purchaseDate: new Date('2022-11-20'), purchasePrice: 2400, condition: 'worn', lastInspection: new Date('2025-01-02') },
    { truckId: truck4.id, serialNumber: 'CNT-2023-067', brand: 'Continental', purchaseDate: new Date('2023-04-18'), purchasePrice: 3100, condition: 'good', lastInspection: new Date('2025-01-02') },
    { truckId: truck4.id, serialNumber: 'CNT-2023-068', brand: 'Continental', purchaseDate: new Date('2023-04-18'), purchasePrice: 3100, condition: 'good', lastInspection: new Date('2025-01-02') },

    // Truck 5: GT-9012-GH (Mercedes Actros 1845) - 4 tyres
    { truckId: truck5.id, serialNumber: 'MCH-2023-112', brand: 'Michelin', purchaseDate: new Date('2023-07-10'), purchasePrice: 2700, condition: 'good', lastInspection: new Date('2025-01-03') },
    { truckId: truck5.id, serialNumber: 'MCH-2023-113', brand: 'Michelin', purchaseDate: new Date('2023-07-10'), purchasePrice: 2700, condition: 'good', lastInspection: new Date('2025-01-03') },
    { truckId: truck5.id, serialNumber: 'DLP-2024-078', brand: 'Dunlop', purchaseDate: new Date('2024-02-25'), purchasePrice: 3000, condition: 'good', lastInspection: new Date('2025-01-03') },
    { truckId: truck5.id, serialNumber: 'DLP-2024-079', brand: 'Dunlop', purchaseDate: new Date('2024-02-25'), purchasePrice: 3000, condition: 'good', lastInspection: new Date('2025-01-03') },

    // Truck 6: GT-3345-HJ (MAN TGX 28.440) - 4 tyres
    { truckId: truck6.id, serialNumber: 'CNT-2024-090', brand: 'Continental', purchaseDate: new Date('2024-10-05'), purchasePrice: 2850, condition: 'new', lastInspection: new Date('2025-01-09') },
    { truckId: truck6.id, serialNumber: 'CNT-2024-091', brand: 'Continental', purchaseDate: new Date('2024-10-05'), purchasePrice: 2850, condition: 'new', lastInspection: new Date('2025-01-09') },
    { truckId: truck6.id, serialNumber: 'MCH-2024-098', brand: 'Michelin', purchaseDate: new Date('2024-10-20'), purchasePrice: 3350, condition: 'new', lastInspection: new Date('2025-01-09') },
    { truckId: truck6.id, serialNumber: 'MCH-2024-099', brand: 'Michelin', purchaseDate: new Date('2024-10-20'), purchasePrice: 3350, condition: 'new', lastInspection: new Date('2025-01-09') },

    // Truck 7: GT-6778-KL (Volvo FH 460) - 4 tyres
    { truckId: truck7.id, serialNumber: 'DLP-2023-134', brand: 'Dunlop', purchaseDate: new Date('2023-12-01'), purchasePrice: 2550, condition: 'good', lastInspection: new Date('2025-01-06') },
    { truckId: truck7.id, serialNumber: 'DLP-2023-135', brand: 'Dunlop', purchaseDate: new Date('2023-12-01'), purchasePrice: 2550, condition: 'good', lastInspection: new Date('2025-01-06') },
    { truckId: truck7.id, serialNumber: 'CNT-2024-150', brand: 'Continental', purchaseDate: new Date('2024-04-15'), purchasePrice: 3100, condition: 'good', lastInspection: new Date('2025-01-06') },
    { truckId: truck7.id, serialNumber: 'CNT-2024-151', brand: 'Continental', purchaseDate: new Date('2024-04-15'), purchasePrice: 3100, condition: 'good', lastInspection: new Date('2025-01-06') },

    // Truck 8: GT-8901-MN (DAF CF 450) - 4 tyres
    { truckId: truck8.id, serialNumber: 'MCH-2022-201', brand: 'Michelin', purchaseDate: new Date('2022-08-22'), purchasePrice: 2600, condition: 'damaged', lastInspection: new Date('2024-12-15'), retiredDate: new Date('2025-01-02'), retiredReason: 'Sidewall damage, beyond repair' },
    { truckId: truck8.id, serialNumber: 'MCH-2022-202', brand: 'Michelin', purchaseDate: new Date('2022-08-22'), purchasePrice: 2600, condition: 'fair', lastInspection: new Date('2024-12-15') },
    { truckId: truck8.id, serialNumber: 'DLP-2023-178', brand: 'Dunlop', purchaseDate: new Date('2023-06-30'), purchasePrice: 2800, condition: 'fair', lastInspection: new Date('2024-12-15') },
    { truckId: truck8.id, serialNumber: 'DLP-2024-180', brand: 'Dunlop', purchaseDate: new Date('2024-05-10'), purchasePrice: 3050, condition: 'good', lastInspection: new Date('2024-12-15') },
  ];

  const tyres = await Promise.all(
    tyreData.map((tyre) =>
      db.tyre.upsert({
        where: { serialNumber: tyre.serialNumber },
        update: {},
        create: tyre,
      })
    )
  );
  console.log(`  ✅ Created ${tyres.length} tyres`);

  // ============================================================
  // 6. INSURANCE
  // ============================================================
  console.log('\n🛡️  Creating insurance policies...');

  const insuranceData = [
    {
      truckId: truck1.id, provider: 'SIC Insurance', policyNumber: 'SIC-MOT-2024-45210',
      type: 'comprehensive', coverAmount: 500000, premium: 8500,
      startDate: new Date('2024-04-01'), endDate: new Date('2025-03-31'), status: 'active',
      renewalReminderSent: true, notes: 'Comprehensive motor insurance with goods-in-transit cover',
    },
    {
      truckId: truck2.id, provider: 'Enterprise Insurance', policyNumber: 'ENT-MOT-2024-78341',
      type: 'comprehensive', coverAmount: 450000, premium: 7800,
      startDate: new Date('2024-06-15'), endDate: new Date('2025-06-14'), status: 'active',
      renewalReminderSent: false, notes: 'Annual comprehensive policy',
    },
    {
      truckId: truck3.id, provider: 'Equity Insurance', policyNumber: 'EQI-MOT-2024-21562',
      type: 'comprehensive', coverAmount: 550000, premium: 9200,
      startDate: new Date('2024-08-01'), endDate: new Date('2025-07-31'), status: 'active',
      renewalReminderSent: false,
    },
    {
      truckId: truck4.id, provider: 'SIC Insurance', policyNumber: 'SIC-MOT-2023-56893',
      type: 'third-party', coverAmount: 100000, premium: 3500,
      startDate: new Date('2023-11-01'), endDate: new Date('2024-10-31'), status: 'expired',
      renewalReminderSent: true, notes: 'Expired - renewal pending',
    },
    {
      truckId: truck5.id, provider: 'Enterprise Insurance', policyNumber: 'ENT-MOT-2024-90124',
      type: 'goods-in-transit', coverAmount: 800000, premium: 12500,
      startDate: new Date('2024-02-01'), endDate: new Date('2025-01-31'), status: 'active',
      renewalReminderSent: false, notes: 'Goods in transit cover for heavy cargo',
    },
    {
      truckId: truck6.id, provider: 'Equity Insurance', policyNumber: 'EQI-MOT-2024-33456',
      type: 'comprehensive', coverAmount: 600000, premium: 10500,
      startDate: new Date('2024-10-01'), endDate: new Date('2025-09-30'), status: 'active',
      renewalReminderSent: false,
    },
  ];

  const insurance = await Promise.all(
    insuranceData.map((ins) =>
      db.insurance.upsert({
        where: { policyNumber: ins.policyNumber },
        update: {},
        create: ins,
      })
    )
  );
  console.log(`  ✅ Created ${insurance.length} insurance policies`);

  // ============================================================
  // 7. TRIPS
  // ============================================================
  console.log('\n🗺️  Creating trips...');

  const tripsData = [
    // COMPLETED trips
    {
      tripNumber: 'TRP-2024-001', truckId: truck1.id, driverId: driver1.id,
      waybillNumber: 'WB-ACC-KUM-2401-001', orderNumber: 'ORD-2024-001',
      loadingLocation: 'Accra', loadingAddress: 'Tema Port, Harbour Road',
      loadingLat: 5.6348, loadingLng: -0.0062,
      destination: 'Kumasi', destinationAddress: 'Kumasi Industrial Area',
      destLat: 6.6884, destLng: -1.6244,
      itemName: '50kg Cement Bags', quantity: 600, unit: 'bags',
      unitPrice: 28.50, totalRevenue: 17100,
      departureTime: new Date('2024-11-05T05:30:00'),
      arrivalTime: new Date('2024-11-05T14:45:00'),
      estimatedDuration: 8, actualDuration: 9.25,
      startMileage: 138200, endMileage: 138820, totalMileage: 620,
      fuelLevelBefore: 85, fuelLevelAfter: 30, fuelUsed: 220, fuelCost: 1650,
      status: 'completed',
      customerName: 'Kumasi Builders Supply Ltd', customerPhone: '+233322456789',
      notes: 'Delivered on time, customer satisfied',
    },
    {
      tripNumber: 'TRP-2024-002', truckId: truck2.id, driverId: driver2.id,
      waybillNumber: 'WB-TEM-TAM-2411-002', orderNumber: 'ORD-2024-002',
      loadingLocation: 'Tema', loadingAddress: 'Tema Free Zone',
      loadingLat: 5.6697, loadingLng: -0.0171,
      destination: 'Tamale', destinationAddress: 'Tamale Market, Bolgatanga Road',
      destLat: 9.4034, destLng: -0.8393,
      itemName: '10mm Iron Rods', quantity: 15, unit: 'tonnes',
      unitPrice: 620, totalRevenue: 9300,
      departureTime: new Date('2024-11-10T04:00:00'),
      arrivalTime: new Date('2024-11-10T18:30:00'),
      estimatedDuration: 12, actualDuration: 14.5,
      startMileage: 190500, endMileage: 191850, totalMileage: 1350,
      fuelLevelBefore: 100, fuelLevelAfter: 15, fuelUsed: 380, fuelCost: 2850,
      status: 'completed',
      customerName: 'Northern Construction Co.', customerPhone: '+233372123456',
      notes: 'Road construction materials for bridge project',
    },
    {
      tripNumber: 'TRP-2024-003', truckId: truck3.id, driverId: driver3.id,
      waybillNumber: 'WB-TAK-ACC-2411-003', orderNumber: 'ORD-2024-003',
      loadingLocation: 'Takoradi', loadingAddress: 'Takoradi Port',
      loadingLat: 4.8983, loadingLng: -1.7607,
      destination: 'Accra', destinationAddress: 'Industrial Area, Accra',
      destLat: 5.6037, destLng: -0.1870,
      itemName: 'Flour', quantity: 20, unit: 'tonnes',
      unitPrice: 450, totalRevenue: 9000,
      departureTime: new Date('2024-11-15T07:00:00'),
      arrivalTime: new Date('2024-11-15T12:30:00'),
      estimatedDuration: 5, actualDuration: 5.5,
      startMileage: 85200, endMileage: 86210, totalMileage: 1010,
      fuelLevelBefore: 90, fuelLevelAfter: 35, fuelUsed: 230, fuelCost: 1725,
      status: 'completed',
      customerName: 'Royal Flour Mills', customerPhone: '+233302567890',
    },
    {
      tripNumber: 'TRP-2024-004', truckId: truck1.id, driverId: driver1.id,
      waybillNumber: 'WB-ACC-CC-2411-004', orderNumber: 'ORD-2024-004',
      loadingLocation: 'Accra', loadingAddress: 'Mallam Junction Depot',
      loadingLat: 5.5483, loadingLng: -0.2373,
      destination: 'Cape Coast', destinationAddress: 'Cape Coast Industrial Zone',
      destLat: 5.1036, destLng: -1.2466,
      itemName: '50kg Rice Bags', quantity: 400, unit: 'bags',
      unitPrice: 22.00, totalRevenue: 8800,
      departureTime: new Date('2024-11-18T06:00:00'),
      arrivalTime: new Date('2024-11-18T09:30:00'),
      estimatedDuration: 3, actualDuration: 3.5,
      startMileage: 138820, endMileage: 139380, totalMileage: 560,
      fuelLevelBefore: 75, fuelLevelAfter: 25, fuelUsed: 200, fuelCost: 1500,
      status: 'completed',
      customerName: 'Central Region Distributors', customerPhone: '+233332098765',
    },
    {
      tripNumber: 'TRP-2024-005', truckId: truck5.id, driverId: driver5.id,
      waybillNumber: 'WB-ACC-KUM-2412-005', orderNumber: 'ORD-2024-005',
      loadingLocation: 'Accra', loadingAddress: 'Tema Motorway Yard',
      loadingLat: 5.6442, loadingLng: -0.0833,
      destination: 'Kumasi', destinationAddress: 'Suame Magazine',
      destLat: 6.6833, destLng: -1.6614,
      itemName: '42.5 Grade Cement', quantity: 800, unit: 'bags',
      unitPrice: 26.50, totalRevenue: 21200,
      departureTime: new Date('2024-12-02T05:00:00'),
      arrivalTime: new Date('2024-12-02T14:00:00'),
      estimatedDuration: 8, actualDuration: 9.0,
      startMileage: 318500, endMileage: 319120, totalMileage: 620,
      fuelLevelBefore: 95, fuelLevelAfter: 30, fuelUsed: 260, fuelCost: 1950,
      status: 'completed',
      customerName: 'Suame Building Materials', customerPhone: '+233322345678',
      notes: 'Full truckload delivery',
    },
    {
      tripNumber: 'TRP-2024-006', truckId: truck6.id, driverId: driver6.id,
      waybillNumber: 'WB-TEM-TEC-2412-006', orderNumber: 'ORD-2024-006',
      loadingLocation: 'Tema', loadingAddress: 'Tema Oil Refinery Area',
      loadingLat: 5.6350, loadingLng: -0.0150,
      destination: 'Techiman', destinationAddress: 'Techiman Main Market',
      destLat: 7.5833, destLng: -1.9333,
      itemName: 'Cooking Oil', quantity: 18, unit: 'tonnes',
      unitPrice: 500, totalRevenue: 9000,
      departureTime: new Date('2024-12-05T05:30:00'),
      arrivalTime: new Date('2024-12-05T16:00:00'),
      estimatedDuration: 9, actualDuration: 10.5,
      startMileage: 42100, endMileage: 43450, totalMileage: 1350,
      fuelLevelBefore: 100, fuelLevelAfter: 20, fuelUsed: 360, fuelCost: 2700,
      status: 'completed',
      customerName: 'Bono East Trading Co.', customerPhone: '+233352098765',
    },
    {
      tripNumber: 'TRP-2024-007', truckId: truck2.id, driverId: driver2.id,
      waybillNumber: 'WB-ACC-SEK-2412-007', orderNumber: 'ORD-2024-007',
      loadingLocation: 'Accra', loadingAddress: 'Kotoka Industrial Area',
      loadingLat: 5.6052, loadingLng: -0.1720,
      destination: 'Sekondi', destinationAddress: 'Sekondi-Takoradi Port',
      destLat: 4.9257, destLng: -1.7511,
      itemName: 'Packaged Sugar', quantity: 500, unit: 'bags',
      unitPrice: 24.00, totalRevenue: 12000,
      departureTime: new Date('2024-12-10T06:00:00'),
      arrivalTime: new Date('2024-12-10T14:00:00'),
      estimatedDuration: 7, actualDuration: 8.0,
      startMileage: 191850, endMileage: 192860, totalMileage: 1010,
      fuelLevelBefore: 80, fuelLevelAfter: 20, fuelUsed: 270, fuelCost: 2025,
      status: 'completed',
      customerName: 'Western Sugar Distributors', customerPhone: '+233312345678',
    },
    {
      tripNumber: 'TRP-2024-008', truckId: truck7.id, driverId: driver3.id,
      waybillNumber: 'WB-KUM-TAM-2412-008', orderNumber: 'ORD-2024-008',
      loadingLocation: 'Kumasi', loadingAddress: 'Kaase Industrial Area',
      loadingLat: 6.7000, loadingLng: -1.6400,
      destination: 'Tamale', destinationAddress: 'Tamale Teaching Hospital Site',
      destLat: 9.4034, destLng: -0.8393,
      itemName: 'Building Blocks', quantity: 2000, unit: 'units',
      unitPrice: 5.50, totalRevenue: 11000,
      departureTime: new Date('2024-12-15T04:30:00'),
      arrivalTime: new Date('2024-12-15T18:00:00'),
      estimatedDuration: 11, actualDuration: 13.5,
      startMileage: 176500, endMileage: 178200, totalMileage: 1700,
      fuelLevelBefore: 100, fuelLevelAfter: 10, fuelUsed: 360, fuelCost: 2700,
      status: 'completed',
      customerName: 'Hospital Construction Project', customerPhone: '+233372456789',
      notes: 'Construction materials for hospital expansion',
    },
    {
      tripNumber: 'TRP-2024-009', truckId: truck3.id, driverId: driver3.id,
      waybillNumber: 'WB-TAK-ACC-2412-009', orderNumber: 'ORD-2024-009',
      loadingLocation: 'Takoradi', loadingAddress: 'Takoradi Harbour',
      loadingLat: 4.8983, loadingLng: -1.7607,
      destination: 'Accra', destinationAddress: 'Trade Fair Centre, Accra',
      destLat: 5.6325, destLng: -0.0650,
      itemName: 'Frozen Fish', quantity: 25, unit: 'tonnes',
      unitPrice: 480, totalRevenue: 12000,
      departureTime: new Date('2024-12-20T03:30:00'),
      arrivalTime: new Date('2024-12-20T09:00:00'),
      estimatedDuration: 5, actualDuration: 5.5,
      startMileage: 86210, endMileage: 87220, totalMileage: 1010,
      fuelLevelBefore: 90, fuelLevelAfter: 30, fuelUsed: 250, fuelCost: 1875,
      status: 'completed',
      customerName: 'Cold Store Ghana Ltd', customerPhone: '+233302789012',
      notes: 'Temperature sensitive cargo - delivered within time',
    },
    {
      tripNumber: 'TRP-2024-010', truckId: truck5.id, driverId: driver5.id,
      waybillNumber: 'WB-ACC-HO-2412-010', orderNumber: 'ORD-2024-010',
      loadingLocation: 'Accra', loadingAddress: '37 Military Hospital Road',
      loadingLat: 5.5780, loadingLng: -0.2150,
      destination: 'Ho', destinationAddress: 'Ho Central Market',
      destLat: 6.6100, destLng: 0.4700,
      itemName: 'Pharmaceutical Products', quantity: 5, unit: 'tonnes',
      unitPrice: 1200, totalRevenue: 6000,
      departureTime: new Date('2024-12-22T07:00:00'),
      arrivalTime: new Date('2024-12-22T12:30:00'),
      estimatedDuration: 4, actualDuration: 5.5,
      startMileage: 319120, endMileage: 319980, totalMileage: 860,
      fuelLevelBefore: 70, fuelLevelAfter: 20, fuelUsed: 200, fuelCost: 1500,
      status: 'completed',
      customerName: 'Volta Regional Medical Stores', customerPhone: '+233362345678',
    },

    // ACTIVE trips — realistic lifecycle stages
    {
      tripNumber: 'TRP-2025-011', truckId: truck1.id, driverId: driver1.id,
      waybillNumber: 'WB-ACC-TAM-2501-011', orderNumber: 'ORD-2025-001',
      loadingLocation: 'Accra', loadingAddress: 'Tema Port',
      loadingLat: 5.6348, loadingLng: -0.0062,
      destination: 'Tamale', destinationAddress: 'Tamale Logistics Hub',
      destLat: 9.4034, destLng: -0.8393,
      itemName: '16mm Iron Rods', quantity: 20, unit: 'tonnes',
      unitPrice: 580, totalRevenue: 11600,
      departureTime: new Date('2025-01-10T04:00:00'),
      estimatedDuration: 14,
      startMileage: 139380, fuelLevelBefore: 100,
      status: 'in_transit',
      customerName: 'Savanna Construction Ltd', customerPhone: '+233372567890',
      notes: 'Expected arrival Jan 10 evening',
    },
    {
      tripNumber: 'TRP-2025-012', truckId: truck6.id, driverId: driver6.id,
      waybillNumber: 'WB-TEM-KUM-2501-012', orderNumber: 'ORD-2025-002',
      loadingLocation: 'Tema', loadingAddress: 'Tema Free Zone',
      loadingLat: 5.6697, loadingLng: -0.0171,
      destination: 'Kumasi', destinationAddress: 'Kumasi Depot',
      destLat: 6.6884, destLng: -1.6244,
      itemName: '50kg Cement Bags', quantity: 700, unit: 'bags',
      unitPrice: 27.00, totalRevenue: 18900,
      departureTime: new Date('2025-01-10T05:00:00'),
      estimatedDuration: 8,
      startMileage: 43450, fuelLevelBefore: 95,
      status: 'offloading',
      offloadingStartedAt: new Date('2025-01-10T14:00:00'),
      totalOffloaded: 420,
      customerName: 'Ashanti Building Supply', customerPhone: '+233324567890',
      notes: 'Currently offloading at Kumasi Depot — 420 of 700 bags done',
    },

    // SCHEDULED trips
    {
      tripNumber: 'TRP-2025-013', truckId: truck2.id, driverId: driver2.id,
      waybillNumber: 'WB-ACC-CCA-2501-013', orderNumber: 'ORD-2025-003',
      loadingLocation: 'Accra', loadingAddress: 'Airport Industrial Area',
      loadingLat: 5.6050, loadingLng: -0.1718,
      destination: 'Cape Coast', destinationAddress: 'University of Cape Coast',
      destLat: 5.1036, destLng: -1.2466,
      itemName: 'Office Furniture', quantity: 3, unit: 'tonnes',
      unitPrice: 1500, totalRevenue: 4500,
      departureTime: new Date('2025-01-15T07:00:00'),
      estimatedDuration: 4,
      status: 'scheduled',
      customerName: 'UCC Procurement', customerPhone: '+233332098765',
    },
    {
      tripNumber: 'TRP-2025-014', truckId: truck3.id, driverId: driver4.id,
      waybillNumber: 'WB-ACC-BOL-2501-014', orderNumber: 'ORD-2025-004',
      loadingLocation: 'Accra', loadingAddress: 'N1 Highway Depot',
      loadingLat: 5.6300, loadingLng: -0.1200,
      destination: 'Bolgatanga', destinationAddress: 'Bolgatanga Market',
      destLat: 10.7865, destLng: -0.8753,
      itemName: 'Bags of Rice', quantity: 500, unit: 'bags',
      unitPrice: 25.00, totalRevenue: 12500,
      departureTime: new Date('2025-01-16T03:30:00'),
      estimatedDuration: 16,
      status: 'scheduled',
      customerName: 'Upper East Food Distributors', customerPhone: '+233382098765',
      notes: 'Food distribution for northern region',
    },
    {
      tripNumber: 'TRP-2025-015', truckId: truck7.id, driverId: driver5.id,
      waybillNumber: 'WB-TAK-KUM-2501-015', orderNumber: 'ORD-2025-005',
      loadingLocation: 'Takoradi', loadingAddress: 'Takoradi Port',
      loadingLat: 4.8983, loadingLng: -1.7607,
      destination: 'Kumasi', destinationAddress: 'Kumasi Kejetia Market',
      destLat: 6.6884, destLng: -1.6244,
      itemName: '12mm Iron Rods', quantity: 25, unit: 'tonnes',
      unitPrice: 560, totalRevenue: 14000,
      departureTime: new Date('2025-01-18T05:00:00'),
      estimatedDuration: 8,
      status: 'loaded',
      customerName: 'Kumasi Hardware Wholesalers', customerPhone: '+233326789012',
      notes: 'Loading complete, waiting for customer confirmation before departure',
    },
  ];

  const trips = await Promise.all(
    tripsData.map((trip) =>
      db.trip.upsert({
        where: { tripNumber: trip.tripNumber },
        update: {},
        create: trip,
      })
    )
  );
  console.log(`  ✅ Created ${trips.length} trips (10 completed, 2 in transit, 3 scheduled)`);

  // ============================================================
  // 8. FUEL LOGS (for completed trips)
  // ============================================================
  console.log('\n⛽ Creating fuel logs...');

  const fuelLogsData = [
    // Trip 001: Accra → Kumasi
    { tripId: trips[0].id, truckId: truck1.id, date: new Date('2024-11-05T04:30:00'), odometer: 138200, fuelLevelBefore: 85, fuelLevelAfter: 100, litersFilled: 60, costPerLiter: 7.50, totalCost: 450, stationName: 'GOIL Accra North', fuelType: 'Diesel', receiptNumber: 'GOI-20241105-001' },
    { tripId: trips[0].id, truckId: truck1.id, date: new Date('2024-11-05T10:00:00'), odometer: 138600, fuelLevelBefore: 50, fuelLevelAfter: 90, litersFilled: 160, costPerLiter: 7.50, totalCost: 1200, stationName: 'Shell Nkawkaw', fuelType: 'Diesel', receiptNumber: 'SHL-20241105-045' },

    // Trip 002: Tema → Tamale
    { tripId: trips[1].id, truckId: truck2.id, date: new Date('2024-11-10T03:00:00'), odometer: 190500, fuelLevelBefore: 100, fuelLevelAfter: 100, litersFilled: 200, costPerLiter: 7.50, totalCost: 1500, stationName: 'Total Tema', fuelType: 'Diesel', receiptNumber: 'TOT-20241110-012' },
    { tripId: trips[1].id, truckId: truck2.id, date: new Date('2024-11-10T09:00:00'), odometer: 191100, fuelLevelBefore: 55, fuelLevelAfter: 95, litersFilled: 180, costPerLiter: 7.50, totalCost: 1350, stationName: 'Shell Kumasi', fuelType: 'Diesel', receiptNumber: 'SHL-20241110-078' },

    // Trip 003: Takoradi → Accra
    { tripId: trips[2].id, truckId: truck3.id, date: new Date('2024-11-15T06:00:00'), odometer: 85200, fuelLevelBefore: 90, fuelLevelAfter: 100, litersFilled: 40, costPerLiter: 7.50, totalCost: 300, stationName: 'GOIL Takoradi', fuelType: 'Diesel', receiptNumber: 'GOI-20241115-023' },
    { tripId: trips[2].id, truckId: truck3.id, date: new Date('2024-11-15T09:30:00'), odometer: 85800, fuelLevelBefore: 60, fuelLevelAfter: 95, litersFilled: 190, costPerLiter: 7.50, totalCost: 1425, stationName: 'Shell Winneba Junction', fuelType: 'Diesel', receiptNumber: 'SHL-20241115-034' },

    // Trip 004: Accra → Cape Coast
    { tripId: trips[3].id, truckId: truck1.id, date: new Date('2024-11-18T05:00:00'), odometer: 138820, fuelLevelBefore: 75, fuelLevelAfter: 100, litersFilled: 100, costPerLiter: 7.50, totalCost: 750, stationName: 'Total Accra West', fuelType: 'Diesel', receiptNumber: 'TOT-20241118-056' },
    { tripId: trips[3].id, truckId: truck1.id, date: new Date('2024-11-18T07:30:00'), odometer: 139100, fuelLevelBefore: 65, fuelLevelAfter: 90, litersFilled: 100, costPerLiter: 7.50, totalCost: 750, stationName: 'GOIL Cape Coast', fuelType: 'Diesel', receiptNumber: 'GOI-20241118-067' },

    // Trip 005: Accra → Kumasi
    { tripId: trips[4].id, truckId: truck5.id, date: new Date('2024-12-02T04:00:00'), odometer: 318500, fuelLevelBefore: 95, fuelLevelAfter: 100, litersFilled: 20, costPerLiter: 7.50, totalCost: 150, stationName: 'Shell Tema', fuelType: 'Diesel', receiptNumber: 'SHL-20241202-001' },
    { tripId: trips[4].id, truckId: truck5.id, date: new Date('2024-12-02T08:00:00'), odometer: 318800, fuelLevelBefore: 55, fuelLevelAfter: 95, litersFilled: 240, costPerLiter: 7.50, totalCost: 1800, stationName: 'Total Kumasi South', fuelType: 'Diesel', receiptNumber: 'TOT-20241202-012' },

    // Trip 006: Tema → Techiman
    { tripId: trips[5].id, truckId: truck6.id, date: new Date('2024-12-05T04:00:00'), odometer: 42100, fuelLevelBefore: 100, fuelLevelAfter: 100, litersFilled: 200, costPerLiter: 7.50, totalCost: 1500, stationName: 'GOIL Tema Main', fuelType: 'Diesel', receiptNumber: 'GOI-20241205-003' },
    { tripId: trips[5].id, truckId: truck6.id, date: new Date('2024-12-05T10:00:00'), odometer: 42800, fuelLevelBefore: 50, fuelLevelAfter: 95, litersFilled: 160, costPerLiter: 7.50, totalCost: 1200, stationName: 'Shell Kumasi Bypass', fuelType: 'Diesel', receiptNumber: 'SHL-20241205-019' },

    // Trip 007: Accra → Sekondi
    { tripId: trips[6].id, truckId: truck2.id, date: new Date('2024-12-10T05:00:00'), odometer: 191850, fuelLevelBefore: 80, fuelLevelAfter: 100, litersFilled: 80, costPerLiter: 7.50, totalCost: 600, stationName: 'Total Accra East', fuelType: 'Diesel', receiptNumber: 'TOT-20241210-021' },
    { tripId: trips[6].id, truckId: truck2.id, date: new Date('2024-12-10T09:00:00'), odometer: 192300, fuelLevelBefore: 50, fuelLevelAfter: 90, litersFilled: 190, costPerLiter: 7.50, totalCost: 1425, stationName: 'GOIL Winneba', fuelType: 'Diesel', receiptNumber: 'GOI-20241210-045' },

    // Trip 008: Kumasi → Tamale
    { tripId: trips[7].id, truckId: truck7.id, date: new Date('2024-12-15T03:00:00'), odometer: 176500, fuelLevelBefore: 100, fuelLevelAfter: 100, litersFilled: 180, costPerLiter: 7.50, totalCost: 1350, stationName: 'Shell Kumasi', fuelType: 'Diesel', receiptNumber: 'SHL-20241215-002' },
    { tripId: trips[7].id, truckId: truck7.id, date: new Date('2024-12-15T10:00:00'), odometer: 177300, fuelLevelBefore: 45, fuelLevelAfter: 90, litersFilled: 180, costPerLiter: 7.50, totalCost: 1350, stationName: 'GOIL Kintampo', fuelType: 'Diesel', receiptNumber: 'GOI-20241215-034' },

    // Trip 009: Takoradi → Accra
    { tripId: trips[8].id, truckId: truck3.id, date: new Date('2024-12-20T02:30:00'), odometer: 86210, fuelLevelBefore: 90, fuelLevelAfter: 100, litersFilled: 50, costPerLiter: 7.50, totalCost: 375, stationName: 'Total Takoradi', fuelType: 'Diesel', receiptNumber: 'TOT-20241220-001' },
    { tripId: trips[8].id, truckId: truck3.id, date: new Date('2024-12-20T07:00:00'), odometer: 86800, fuelLevelBefore: 55, fuelLevelAfter: 95, litersFilled: 200, costPerLiter: 7.50, totalCost: 1500, stationName: 'Shell Mankessim', fuelType: 'Diesel', receiptNumber: 'SHL-20241220-056' },

    // Trip 010: Accra → Ho
    { tripId: trips[9].id, truckId: truck5.id, date: new Date('2024-12-22T06:00:00'), odometer: 319120, fuelLevelBefore: 70, fuelLevelAfter: 100, litersFilled: 120, costPerLiter: 7.50, totalCost: 900, stationName: 'GOIL Accra Tetteh Quarshie', fuelType: 'Diesel', receiptNumber: 'GOI-20241222-012' },
    { tripId: trips[9].id, truckId: truck5.id, date: new Date('2024-12-22T09:30:00'), odometer: 319600, fuelLevelBefore: 60, fuelLevelAfter: 90, litersFilled: 80, costPerLiter: 7.50, totalCost: 600, stationName: 'Total Ho', fuelType: 'Diesel', receiptNumber: 'TOT-20241222-023' },
  ];

  const fuelLogs = await Promise.all(
    fuelLogsData.map((fl) => db.fuelLog.create({ data: fl }))
  );
  console.log(`  ✅ Created ${fuelLogs.length} fuel logs`);

  // ============================================================
  // 9. MAINTENANCE RECORDS
  // ============================================================
  console.log('\n🔧 Creating maintenance records...');

  const maintenanceData = [
    {
      truckId: truck1.id, type: 'routine', title: 'Oil Change & Filter Replacement',
      description: 'Full engine oil change with Mann filter. Used Shell Rimula R6 15W-40. 24 litres of oil.',
      odometer: 130000, cost: 1200, performedBy: 'KOF Motors Workshop, Accra',
      performedAt: new Date('2024-08-15'), nextDueDate: new Date('2024-11-15'), nextDueMileage: 144000,
      status: 'completed', partsUsed: JSON.stringify([{ part: 'Engine Oil 15W-40', qty: 24, cost: 720 }, { part: 'Oil Filter', qty: 1, cost: 150 }, { part: 'Fuel Filter', qty: 1, cost: 180 }]),
    },
    {
      truckId: truck2.id, type: 'repair', title: 'Brake Pad Replacement - All Axles',
      description: 'Replaced worn brake pads on front and rear axles. Replaced 2 brake discs that were warped.',
      odometer: 180000, cost: 3500, performedBy: 'MAN Service Centre, Tema',
      performedAt: new Date('2024-09-20'), nextDueDate: new Date('2025-09-20'), nextDueMileage: 360000,
      status: 'completed', partsUsed: JSON.stringify([{ part: 'Brake Pad Set (Front)', qty: 2, cost: 900 }, { part: 'Brake Pad Set (Rear)', qty: 4, cost: 1400 }, { part: 'Brake Disc', qty: 2, cost: 800 }]),
    },
    {
      truckId: truck4.id, type: 'repair', title: 'Engine Overhaul - In Progress',
      description: 'Major engine overhaul due to excessive oil consumption and loss of compression. Cylinder head removed for valve seat replacement.',
      odometer: 267000, cost: 18500, performedBy: 'Volvo Ghana Workshop, Accra',
      performedAt: new Date('2025-01-05'), nextDueDate: null, nextDueMileage: null,
      status: 'in_progress', partsUsed: JSON.stringify([{ part: 'Piston Ring Set', qty: 6, cost: 2400 }, { part: 'Valve Stem Seals', qty: 24, cost: 960 }, { part: 'Head Gasket Set', qty: 1, cost: 800 }, { part: 'Main Bearings', qty: 7, cost: 2100 }]),
    },
    {
      truckId: truck5.id, type: 'routine', title: '30,000km Major Service',
      description: 'Major service including oil change, all filters, brake inspection, suspension check, and coolant replacement.',
      odometer: 315000, cost: 2800, performedBy: 'Fleet In-House Workshop',
      performedAt: new Date('2024-11-10'), nextDueDate: new Date('2025-05-10'), nextDueMileage: 345000,
      status: 'completed', partsUsed: JSON.stringify([{ part: 'Engine Oil', qty: 28, cost: 840 }, { part: 'Air Filter', qty: 1, cost: 200 }, { part: 'Fuel Filter', qty: 2, cost: 360 }, { part: 'Coolant 50/50', qty: 20, cost: 600 }]),
    },
    {
      truckId: truck3.id, type: 'routine', title: 'First Annual Service',
      description: 'First major service on new DAF XF. All fluids checked and replaced. Warranty service.',
      odometer: 80000, cost: 1500, performedBy: 'DAF Trucks Ghana, Tema',
      performedAt: new Date('2024-12-01'), nextDueDate: new Date('2025-06-01'), nextDueMileage: 120000,
      status: 'completed', partsUsed: JSON.stringify([{ part: 'Engine Oil', qty: 22, cost: 660 }, { part: 'All Filters Kit', qty: 1, cost: 450 }, { part: 'Differential Oil', qty: 8, cost: 240 }]),
    },
    {
      truckId: truck6.id, type: 'inspection', title: 'DVLA Roadworthy Inspection',
      description: 'Annual roadworthy inspection at DVLA Tema station. All checks passed.',
      odometer: 40000, cost: 350, performedBy: 'DVLA Testing Centre, Tema',
      performedAt: new Date('2024-12-15'), nextDueDate: new Date('2025-12-15'), nextDueMileage: 160000,
      status: 'completed',
    },
    {
      truckId: truck8.id, type: 'repair', title: 'Brake System Overhaul',
      description: 'Complete brake system overhaul including air lines, brake chambers, and slack adjusters. Truck currently out of service.',
      odometer: 385000, cost: 6200, performedBy: 'Tema Heavy Duty Workshop',
      performedAt: new Date('2025-01-08'), nextDueDate: new Date('2026-01-08'), nextDueMileage: 535000,
      status: 'in_progress', partsUsed: JSON.stringify([{ part: 'Brake Chamber', qty: 6, cost: 1800 }, { part: 'Slack Adjuster', qty: 4, cost: 800 }, { part: 'Air Line Kit', qty: 1, cost: 600 }, { part: 'Brake Drum', qty: 2, cost: 1600 }]),
    },
    {
      truckId: truck1.id, type: 'routine', title: 'Tyre Rotation & Alignment',
      description: 'Rotated tyres front-to-rear for even wear. Full wheel alignment performed.',
      odometer: 140000, cost: 450, performedBy: 'Michelin Service Centre, Accra',
      performedAt: new Date('2024-12-20'), nextDueDate: new Date('2025-06-20'), nextDueMileage: 170000,
      status: 'completed',
    },
    {
      truckId: truck7.id, type: 'routine', title: 'Transmission Fluid Change',
      description: 'Gearbox oil drain and refill. Inspection of gearbox mountings.',
      odometer: 175000, cost: 850, performedBy: 'Volvo Ghana Workshop',
      performedAt: new Date('2024-10-25'), nextDueDate: new Date('2025-10-25'), nextDueMileage: 335000,
      status: 'completed', partsUsed: JSON.stringify([{ part: 'Gearbox Oil SAE 75W', qty: 12, cost: 480 }, { part: 'Gasket Kit', qty: 1, cost: 120 }]),
    },
    {
      truckId: truck2.id, type: 'inspection', title: 'Pre-Trip Safety Inspection',
      description: 'Thorough pre-long-trip safety check before Tema-Tamale route. All lights, brakes, and fluids verified.',
      odometer: 191000, cost: 150, performedBy: 'Fleet In-House Workshop',
      performedAt: new Date('2024-11-08'), nextDueDate: null, nextDueMileage: null,
      status: 'completed',
    },
  ];

  const maintenanceRecords = await Promise.all(
    maintenanceData.map((mr) => db.maintenanceRecord.create({ data: mr }))
  );
  console.log(`  ✅ Created ${maintenanceRecords.length} maintenance records`);

  // ============================================================
  // 10. EXPENSES
  // ============================================================
  console.log('\n💰 Creating expenses...');

  const expensesData = [
    // Fuel expenses (matching some fuel logs)
    { truckId: truck1.id, category: 'fuel', description: 'Diesel - Accra to Kumasi trip (TRP-001)', amount: 1650, date: new Date('2024-11-05'), paymentMethod: 'mobile_money', reference: 'MTN-MOMO-1124001', approvedBy: adminUser.id, status: 'approved', tripId: trips[0].id },
    { truckId: truck2.id, category: 'fuel', description: 'Diesel - Tema to Tamale trip (TRP-002)', amount: 2850, date: new Date('2024-11-10'), paymentMethod: 'mobile_money', reference: 'VOD-CASH-1124002', approvedBy: adminUser.id, status: 'approved', tripId: trips[1].id },
    { truckId: truck3.id, category: 'fuel', description: 'Diesel - Takoradi to Accra trip (TRP-003)', amount: 1725, date: new Date('2024-11-15'), paymentMethod: 'cash', reference: 'CASH-1124003', approvedBy: managerUser.id, status: 'approved', tripId: trips[2].id },
    { truckId: truck5.id, category: 'fuel', description: 'Diesel - Accra to Kumasi trip (TRP-005)', amount: 1950, date: new Date('2024-12-02'), paymentMethod: 'mobile_money', reference: 'MTN-MOMO-1202001', approvedBy: managerUser.id, status: 'approved', tripId: trips[4].id },
    { truckId: truck6.id, category: 'fuel', description: 'Diesel - Tema to Techiman trip (TRP-006)', amount: 2700, date: new Date('2024-12-05'), paymentMethod: 'cash', reference: 'CASH-1205001', approvedBy: adminUser.id, status: 'approved', tripId: trips[5].id },

    // Maintenance expenses
    { truckId: truck1.id, category: 'maintenance', description: 'Oil change & filter replacement', amount: 1200, date: new Date('2024-08-15'), paymentMethod: 'bank_transfer', reference: 'BANK-0815001', approvedBy: adminUser.id, status: 'approved' },
    { truckId: truck2.id, category: 'maintenance', description: 'Brake pad replacement all axles', amount: 3500, date: new Date('2024-09-20'), paymentMethod: 'bank_transfer', reference: 'BANK-0920001', approvedBy: adminUser.id, status: 'approved' },
    { truckId: truck4.id, category: 'maintenance', description: 'Engine overhaul (partial payment)', amount: 10000, date: new Date('2025-01-05'), paymentMethod: 'bank_transfer', reference: 'BANK-0105001', approvedBy: adminUser.id, status: 'approved' },
    { truckId: truck8.id, category: 'maintenance', description: 'Brake system overhaul (partial)', amount: 3500, date: new Date('2025-01-08'), paymentMethod: 'cash', reference: 'CASH-0108001', approvedBy: managerUser.id, status: 'approved' },
    { truckId: truck3.id, category: 'maintenance', description: 'DAF XF annual service', amount: 1500, date: new Date('2024-12-01'), paymentMethod: 'bank_transfer', reference: 'BANK-1201001', approvedBy: adminUser.id, status: 'approved' },

    // Tyre expenses
    { truckId: truck1.id, category: 'tyre', description: '2x Michelin 295/80 R22.5 front tyres', amount: 5600, date: new Date('2024-03-15'), paymentMethod: 'bank_transfer', reference: 'BANK-0315001', approvedBy: adminUser.id, status: 'approved' },
    { truckId: truck3.id, category: 'tyre', description: '4x Continental 295/80 R22.5 new tyres', amount: 11600, date: new Date('2024-08-12'), paymentMethod: 'bank_transfer', reference: 'BANK-0812001', approvedBy: adminUser.id, status: 'approved' },
    { truckId: truck6.id, category: 'tyre', description: '4x tyres (2x Continental + 2x Michelin)', amount: 12400, date: new Date('2024-10-15'), paymentMethod: 'bank_transfer', reference: 'BANK-1015001', approvedBy: adminUser.id, status: 'approved' },

    // Insurance expenses
    { truckId: truck1.id, category: 'insurance', description: 'SIC Insurance annual premium 2024-2025', amount: 8500, date: new Date('2024-04-01'), paymentMethod: 'bank_transfer', reference: 'BANK-0401001', approvedBy: adminUser.id, status: 'approved' },
    { truckId: truck2.id, category: 'insurance', description: 'Enterprise Insurance annual premium 2024-2025', amount: 7800, date: new Date('2024-06-15'), paymentMethod: 'bank_transfer', reference: 'BANK-0615001', approvedBy: adminUser.id, status: 'approved' },

    // Toll expenses
    { truckId: truck1.id, category: 'toll', description: 'Toll fees Accra-Kumasi highway', amount: 40, date: new Date('2024-11-05'), paymentMethod: 'cash', reference: 'TOLL-1105', approvedBy: managerUser.id, status: 'approved', tripId: trips[0].id },
    { truckId: truck5.id, category: 'toll', description: 'Toll fees Accra-Kumasi highway', amount: 40, date: new Date('2024-12-02'), paymentMethod: 'cash', reference: 'TOLL-1202', approvedBy: managerUser.id, status: 'approved', tripId: trips[4].id },

    // Permit / Fine
    { truckId: truck2.id, category: 'permit', description: 'DVLA roadworthy renewal fee', amount: 200, date: new Date('2024-10-01'), paymentMethod: 'mobile_money', reference: 'MTN-MOMO-1001001', approvedBy: adminUser.id, status: 'approved' },
    { truckId: truck4.id, category: 'fine', description: 'Overloading fine - Tema checkpoint', amount: 500, date: new Date('2024-11-25'), paymentMethod: 'cash', reference: 'FINE-GP-1125', approvedBy: adminUser.id, status: 'approved' },
  ];

  const expenses = await Promise.all(
    expensesData.map((exp) => db.expense.create({ data: exp }))
  );
  console.log(`  ✅ Created ${expenses.length} expenses`);

  // ============================================================
  // 11. PRICING
  // ============================================================
  console.log('\n📊 Creating pricing entries...');

  const pricingData = [
    { itemName: '50kg Cement Bags', destination: 'Kumasi', transportRate: 17100, effectiveDate: new Date('2024-01-01'), isActive: true },
    { itemName: '50kg Cement Bags', destination: 'Cape Coast', transportRate: 8800, effectiveDate: new Date('2024-01-01'), isActive: true },
    { itemName: '50kg Cement Bags', destination: 'Tamale', transportRate: 18900, effectiveDate: new Date('2024-06-01'), isActive: true },
    { itemName: '10mm Iron Rods', destination: 'Tamale', transportRate: 9300, effectiveDate: new Date('2024-01-01'), isActive: true },
    { itemName: '16mm Iron Rods', destination: 'Tamale', transportRate: 11600, effectiveDate: new Date('2024-06-01'), isActive: true },
    { itemName: '12mm Iron Rods', destination: 'Kumasi', transportRate: 14000, effectiveDate: new Date('2024-03-01'), isActive: true },
    { itemName: 'Flour', destination: 'Accra', transportRate: 9000, effectiveDate: new Date('2024-01-01'), isActive: true },
    { itemName: '50kg Rice Bags', destination: 'Cape Coast', transportRate: 8800, effectiveDate: new Date('2024-01-01'), isActive: true },
    { itemName: '50kg Rice Bags', destination: 'Bolgatanga', transportRate: 12500, effectiveDate: new Date('2024-06-01'), isActive: true },
    { itemName: 'Cooking Oil', destination: 'Techiman', transportRate: 9000, effectiveDate: new Date('2024-01-01'), isActive: true },
    { itemName: 'Packaged Sugar', destination: 'Sekondi', transportRate: 12000, effectiveDate: new Date('2024-01-01'), isActive: true },
    { itemName: 'Frozen Fish', destination: 'Accra', transportRate: 12000, effectiveDate: new Date('2024-09-01'), isActive: true },
    { itemName: 'Building Blocks', destination: 'Tamale', transportRate: 11000, effectiveDate: new Date('2024-06-01'), isActive: true },
    { itemName: 'Pharmaceutical Products', destination: 'Ho', transportRate: 6000, effectiveDate: new Date('2024-01-01'), isActive: true },
  ];

  const pricing = await Promise.all(
    pricingData.map((p) => db.pricing.upsert({
      where: { itemName_destination: { itemName: p.itemName, destination: p.destination } },
      update: {},
      create: p,
    }))
  );
  console.log(`  ✅ Created ${pricing.length} pricing entries`);

  // ============================================================
  // 12. PAYROLL
  // ============================================================
  console.log('\n🧾 Creating payroll records...');

  const payrollData = [
    // December 2024
    { driverId: driver1.id, month: 12, year: 2024, baseSalary: 2500, tripBonus: 900, overtimePay: 350, deductions: 420, netPay: 3330, status: 'paid', paidAt: new Date('2024-12-28T10:00:00'), approvedBy: adminUser.id, notes: '4 completed trips in December' },
    { driverId: driver2.id, month: 12, year: 2024, baseSalary: 2200, tripBonus: 600, overtimePay: 200, deductions: 380, netPay: 2620, status: 'paid', paidAt: new Date('2024-12-28T10:00:00'), approvedBy: adminUser.id, notes: '2 completed trips in December' },
    { driverId: driver3.id, month: 12, year: 2024, baseSalary: 2800, tripBonus: 1200, overtimePay: 500, deductions: 450, netPay: 4050, status: 'paid', paidAt: new Date('2024-12-28T10:00:00'), approvedBy: adminUser.id, notes: '3 completed trips including long-haul. Driver of the month.' },
    { driverId: driver5.id, month: 12, year: 2024, baseSalary: 3000, tripBonus: 700, overtimePay: 150, deductions: 480, netPay: 3370, status: 'paid', paidAt: new Date('2024-12-28T10:00:00'), approvedBy: adminUser.id, notes: '2 completed trips in December' },

    // November 2024
    { driverId: driver1.id, month: 11, year: 2024, baseSalary: 2500, tripBonus: 800, overtimePay: 250, deductions: 400, netPay: 3150, status: 'paid', paidAt: new Date('2024-11-29T10:00:00'), approvedBy: adminUser.id, notes: '3 completed trips in November' },
    { driverId: driver2.id, month: 11, year: 2024, baseSalary: 2200, tripBonus: 500, overtimePay: 100, deductions: 350, netPay: 2450, status: 'paid', paidAt: new Date('2024-11-29T10:00:00'), approvedBy: adminUser.id, notes: '1 completed long-haul trip' },
    { driverId: driver3.id, month: 11, year: 2024, baseSalary: 2800, tripBonus: 900, overtimePay: 400, deductions: 430, netPay: 3670, status: 'paid', paidAt: new Date('2024-11-29T10:00:00'), approvedBy: adminUser.id, notes: '2 completed trips' },

    // January 2025 (pending)
    { driverId: driver1.id, month: 1, year: 2025, baseSalary: 2500, tripBonus: 0, overtimePay: 0, deductions: 0, netPay: 2500, status: 'pending', notes: 'Trips still in progress' },
    { driverId: driver2.id, month: 1, year: 2025, baseSalary: 2200, tripBonus: 0, overtimePay: 0, deductions: 0, netPay: 2200, status: 'pending', notes: 'Awaiting trip completion' },
    { driverId: driver3.id, month: 1, year: 2025, baseSalary: 2800, tripBonus: 0, overtimePay: 0, deductions: 0, netPay: 2800, status: 'pending', notes: 'Scheduled trip pending' },
    { driverId: driver5.id, month: 1, year: 2025, baseSalary: 3000, tripBonus: 0, overtimePay: 0, deductions: 0, netPay: 3000, status: 'pending', notes: 'Trips still in progress' },
  ];

  const payroll = await Promise.all(
    payrollData.map((pr) => db.payroll.upsert({
      where: { driverId_month_year: { driverId: pr.driverId, month: pr.month, year: pr.year } },
      update: {},
      create: pr,
    }))
  );
  console.log(`  ✅ Created ${payroll.length} payroll records`);

  // ============================================================
  // 13. NOTIFICATIONS
  // ============================================================
  console.log('\n🔔 Creating notifications...');

  const notificationsData = [
    {
      userId: adminUser.id, type: 'maintenance_due',
      title: 'Engine Overhaul In Progress',
      message: 'GT-5689-ER (Volvo FH 500) is currently undergoing engine overhaul at Volvo Ghana Workshop. Estimated completion: January 20, 2025. Cost so far: GHS 18,500.',
      channel: 'in_app', isRead: false, link: '/maintenance',
      metadata: JSON.stringify({ truckId: truck4.id, truckPlate: 'GT-5689-ER', maintenanceId: maintenanceRecords[2].id }),
    },
    {
      userId: adminUser.id, type: 'insurance_expiring',
      title: 'Insurance Expiring Soon - GT-9012-GH',
      message: 'Enterprise Insurance policy (ENT-MOT-2024-90124) for GT-9012-GH expires on January 31, 2025. Please initiate renewal.',
      channel: 'in_app', isRead: true, readAt: new Date('2025-01-05T14:00:00'), link: '/insurance',
      metadata: JSON.stringify({ truckId: truck5.id, insuranceId: insurance[4].id, expiryDate: '2025-01-31' }),
    },
    {
      userId: managerUser.id, type: 'insurance_expiring',
      title: 'Insurance Expired - GT-5689-ER',
      message: 'SIC Insurance third-party policy for GT-5689-ER expired on October 31, 2024. This truck should not operate until insurance is renewed.',
      channel: 'in_app', isRead: true, readAt: new Date('2024-11-01T08:30:00'), link: '/insurance',
      metadata: JSON.stringify({ truckId: truck4.id, insuranceId: insurance[3].id, expiryDate: '2024-10-31' }),
    },
    {
      userId: adminUser.id, type: 'trip_completed',
      title: 'Trip Completed: Accra → Tamale',
      message: 'TRP-2024-002 (Tema → Tamale) has been completed. Driver: Emmanuel Owusu. Total distance: 1,350 km. Revenue: GHS 9,300.',
      channel: 'in_app', isRead: true, readAt: new Date('2024-11-10T19:00:00'), link: '/trips',
      metadata: JSON.stringify({ tripId: trips[1].id, tripNumber: 'TRP-2024-002', driverName: 'Emmanuel Owusu', revenue: 9300 }),
    },
    {
      userId: managerUser.id, type: 'maintenance_due',
      title: 'Brake Overhaul - GT-8901-MN',
      message: 'GT-8901-MN (DAF CF 450) is currently at Tema Heavy Duty Workshop for brake system overhaul. Status: In Progress. Cost: GHS 6,200.',
      channel: 'in_app', isRead: false, link: '/maintenance',
      metadata: JSON.stringify({ truckId: truck8.id, maintenanceId: maintenanceRecords[6].id }),
    },
    {
      userId: adminUser.id, type: 'alert',
      title: 'Tyre Replacement Needed - GT-5689-ER',
      message: 'Front left tyre (DLP-2022-034) on GT-5689-ER has only 2.1mm tread depth remaining. Immediate replacement recommended.',
      channel: 'in_app', isRead: false, link: '/tyres',
      metadata: JSON.stringify({ truckId: truck4.id, tyreSerial: 'DLP-2022-034', treadDepth: 2.1 }),
    },
    {
      userId: managerUser.id, type: 'trip_completed',
      title: 'Trip Completed: Takoradi → Accra',
      message: 'TRP-2024-009 (Takoradi → Accra) completed. Driver: Yaw Adjei. Distance: 1,010 km. Revenue: GHS 12,000. Frozen fish delivered on time.',
      channel: 'in_app', isRead: true, readAt: new Date('2024-12-20T10:00:00'), link: '/trips',
      metadata: JSON.stringify({ tripId: trips[8].id, tripNumber: 'TRP-2024-009', driverName: 'Yaw Adjei', revenue: 12000 }),
    },
    {
      userId: adminUser.id, type: 'info',
      title: 'Monthly Fleet Summary - December 2024',
      message: 'December 2024 fleet summary: 10 trips completed, 8,190 km total mileage, GHS 112,900 total revenue, 2 trucks in maintenance. Driver of the month: Yaw Adjei (3 trips, 2,710 km).',
      channel: 'in_app', isRead: false, link: '/reports',
      metadata: JSON.stringify({ month: 12, year: 2024, totalTrips: 10, totalRevenue: 112900, totalMileage: 8190 }),
    },
  ];

  const notifications = await Promise.all(
    notificationsData.map((notif) => db.notification.create({ data: notif }))
  );
  console.log(`  ✅ Created ${notifications.length} notifications`);

  // ============================================================
  // 14. DVLA REGISTRATIONS
  // ============================================================
  console.log('\n📋 Creating DVLA registrations...');

  const existingDvla = await db.dvlaRegistration.count();
  const dvlaRegistrations = existingDvla > 0 ? [] : await Promise.all([
    db.dvlaRegistration.create({
      data: {
        truckId: truck1.id,
        registrationNumber: 'GR-4521-2021',
        certificateNumber: 'DVLA-CERT-2021-00145',
        vehicleClass: 'heavy_goods',
        bodyType: 'flatbed',
        axleConfiguration: '6x4',
        grossVehicleWeight: 28000,
        unladenWeight: 12000,
        engineCapacity: '12800cc',
        yearOfManufacture: 2021,
        countryOfOrigin: 'Germany',
        registeredOwner: 'iFleetPro Ltd',
        ownerAddress: '37 Ring Road Central, Accra',
        ownerContact: '+233 30 277 8899',
        dvlaOffice: 'DVLA Accra Head Office',
        registrationDate: new Date('2021-08-15'),
        expiryDate: new Date('2026-08-14'),
        lastRenewalDate: new Date('2024-08-10'),
        nextRenewalDue: new Date('2026-08-14'),
        registrationFee: 450,
        renewalFee: 350,
        status: 'active',
        notes: 'First registered on import from Germany',
      },
    }),
    db.dvlaRegistration.create({
      data: {
        truckId: truck2.id,
        registrationNumber: 'AW-7834-2020',
        certificateNumber: 'DVLA-CERT-2020-00672',
        vehicleClass: 'heavy_goods',
        bodyType: 'flatbed',
        axleConfiguration: '6x2',
        grossVehicleWeight: 26000,
        unladenWeight: 11000,
        engineCapacity: '12900cc',
        yearOfManufacture: 2020,
        countryOfOrigin: 'Germany',
        registeredOwner: 'iFleetPro Ltd',
        ownerAddress: '37 Ring Road Central, Accra',
        ownerContact: '+233 30 277 8899',
        dvlaOffice: 'DVLA Accra Head Office',
        registrationDate: new Date('2020-11-20'),
        expiryDate: new Date('2025-11-19'),
        lastRenewalDate: new Date('2023-11-15'),
        nextRenewalDue: new Date('2025-11-19'),
        registrationFee: 450,
        renewalFee: 350,
        status: 'active',
      },
    }),
    db.dvlaRegistration.create({
      data: {
        truckId: truck3.id,
        registrationNumber: 'GE-2156-2022',
        certificateNumber: 'DVLA-CERT-2022-00215',
        vehicleClass: 'medium_goods',
        bodyType: 'container',
        axleConfiguration: '4x2',
        grossVehicleWeight: 19000,
        unladenWeight: 8500,
        engineCapacity: '10700cc',
        yearOfManufacture: 2022,
        countryOfOrigin: 'Netherlands',
        registeredOwner: 'iFleetPro Ltd',
        ownerAddress: '37 Ring Road Central, Accra',
        ownerContact: '+233 30 277 8899',
        dvlaOffice: 'DVLA Tema Office',
        registrationDate: new Date('2022-03-10'),
        expiryDate: new Date('2024-03-09'),
        lastRenewalDate: null,
        nextRenewalDue: null,
        registrationFee: 350,
        renewalFee: 280,
        status: 'expired',
        notes: 'Registration lapsed, renewal in progress at DVLA Tema',
      },
    }),
    db.dvlaRegistration.create({
      data: {
        truckId: truck5.id,
        registrationNumber: 'CR-9012-2018',
        certificateNumber: 'DVLA-CERT-2018-00901',
        vehicleClass: 'heavy_goods',
        bodyType: 'tipper',
        axleConfiguration: '6x4',
        grossVehicleWeight: 30000,
        unladenWeight: 13500,
        engineCapacity: '12000cc',
        yearOfManufacture: 2018,
        countryOfOrigin: 'Germany',
        registeredOwner: 'iFleetPro Ltd',
        ownerAddress: '37 Ring Road Central, Accra',
        ownerContact: '+233 30 277 8899',
        dvlaOffice: 'DVLA Kumasi Office',
        registrationDate: new Date('2018-05-22'),
        expiryDate: new Date('2023-05-21'),
        lastRenewalDate: new Date('2021-05-15'),
        nextRenewalDue: new Date('2023-05-21'),
        registrationFee: 450,
        renewalFee: 350,
        status: 'suspended',
        notes: 'Suspended due to pending roadworthy re-inspection after minor accident',
      },
    }),
    db.dvlaRegistration.create({
      data: {
        truckId: truck6.id,
        registrationNumber: 'NR-3345-2023',
        certificateNumber: 'DVLA-CERT-2023-00334',
        vehicleClass: 'articulated',
        bodyType: 'tanker_trailer',
        axleConfiguration: '6x4',
        grossVehicleWeight: 40000,
        unladenWeight: 16000,
        engineCapacity: '10600cc',
        yearOfManufacture: 2023,
        countryOfOrigin: 'Germany',
        registeredOwner: 'iFleetPro Ltd',
        ownerAddress: '37 Ring Road Central, Accra',
        ownerContact: '+233 30 277 8899',
        dvlaOffice: 'DVLA Accra Head Office',
        registrationDate: new Date('2023-09-05'),
        expiryDate: new Date('2028-09-04'),
        lastRenewalDate: new Date('2023-09-05'),
        nextRenewalDue: new Date('2028-09-04'),
        registrationFee: 600,
        renewalFee: 500,
        status: 'active',
      },
    }),
  ]);
  console.log(`  ✅ Created ${dvlaRegistrations.length} DVLA registrations`);

  // ============================================================
  // 15. ROADWORTHY INSPECTIONS
  // ============================================================
  console.log('\n🔧 Creating roadworthy inspections...');

  const existingInspections = await db.roadworthyInspection.count();
  const roadworthyInspections = existingInspections > 0 ? [] : await Promise.all([
    db.roadworthyInspection.create({
      data: {
        truckId: truck1.id,
        certificateNumber: 'RW-CERT-2025-00001',
        inspectionType: 'annual',
        inspectionDate: new Date('2025-01-05'),
        inspectionStation: 'DVLA Testing Station Accra',
        inspectorName: 'Daniel Mensah',
        inspectorId: 'DVLA-INSP-045',
        result: 'passed',
        vehicleFitness: 'fit',
        brakesCheck: 'pass',
        lightsCheck: 'pass',
        tyresCheck: 'pass',
        emissionsCheck: 'pass',
        steeringCheck: 'pass',
        suspensionCheck: 'pass',
        bodyCheck: 'pass',
        electricalCheck: 'pass',
        odometerReading: 144500,
        certificateIssued: true,
        certificateExpiry: new Date('2026-01-04'),
        inspectionFee: 200,
        nextInspectionDue: new Date('2026-01-04'),
        status: 'completed',
        recommendations: 'All checks passed, vehicle in excellent condition',
      },
    }),
    db.roadworthyInspection.create({
      data: {
        truckId: truck2.id,
        certificateNumber: 'RW-CERT-2024-00087',
        inspectionType: 'annual',
        inspectionDate: new Date('2024-06-15'),
        inspectionStation: 'DVLA Testing Station Accra',
        inspectorName: 'Kwame Osei',
        inspectorId: 'DVLA-INSP-012',
        result: 'passed',
        vehicleFitness: 'fit',
        brakesCheck: 'pass',
        lightsCheck: 'pass',
        tyresCheck: 'advisory',
        emissionsCheck: 'pass',
        steeringCheck: 'pass',
        suspensionCheck: 'pass',
        bodyCheck: 'pass',
        electricalCheck: 'pass',
        odometerReading: 185000,
        certificateIssued: true,
        certificateExpiry: new Date('2025-06-14'),
        inspectionFee: 200,
        nextInspectionDue: new Date('2025-06-14'),
        status: 'completed',
        advisories: JSON.stringify([{ area: 'tyres', description: 'Rear left axle tyre approaching minimum tread depth', severity: 'advisory' }]),
      },
    }),
    db.roadworthyInspection.create({
      data: {
        truckId: truck4.id,
        certificateNumber: 'RW-CERT-2025-00012',
        inspectionType: 'special',
        inspectionDate: new Date('2025-01-08'),
        inspectionStation: 'Private Garage - KOF Motors, Accra',
        inspectorName: 'Emmanuel Darko',
        inspectorId: 'PVT-INSP-023',
        result: 'failed',
        vehicleFitness: 'unfit',
        brakesCheck: 'fail',
        lightsCheck: 'pass',
        tyresCheck: 'fail',
        emissionsCheck: 'pass',
        steeringCheck: 'pass',
        suspensionCheck: 'advisory',
        bodyCheck: 'pass',
        electricalCheck: 'pass',
        odometerReading: 267000,
        certificateIssued: false,
        inspectionFee: 250,
        status: 'completed',
        defectsFound: JSON.stringify([
          { area: 'brakes', severity: 'major', description: 'Front brake pads worn beyond minimum thickness. Both air chambers showing signs of leakage.' },
          { area: 'tyres', severity: 'major', description: 'Front left tyre tread depth 2.1mm, below legal minimum of 1.6mm. Both front tyres need replacement.' },
        ]),
        recommendations: 'Replace front brake pads and both front tyres before re-inspection. Repair air brake system leaks.',
      },
    }),
    db.roadworthyInspection.create({
      data: {
        truckId: truck3.id,
        certificateNumber: 'RW-CERT-2025-00013',
        inspectionType: 'quarterly',
        inspectionDate: new Date('2025-01-09'),
        inspectionStation: 'DVLA Testing Station Tema',
        inspectorName: 'Patricia Amponsah',
        inspectorId: 'DVLA-INSP-078',
        result: 'conditional_pass',
        vehicleFitness: 'conditional',
        brakesCheck: 'pass',
        lightsCheck: 'pass',
        tyresCheck: 'pass',
        emissionsCheck: 'advisory',
        steeringCheck: 'pass',
        suspensionCheck: 'pass',
        bodyCheck: 'pass',
        electricalCheck: 'pass',
        odometerReading: 89200,
        certificateIssued: true,
        certificateExpiry: new Date('2025-04-08'),
        inspectionFee: 150,
        nextInspectionDue: new Date('2025-04-08'),
        status: 'completed',
        defectsFound: JSON.stringify([
          { area: 'emissions', severity: 'minor', description: 'Slightly elevated CO2 emissions, likely due to injector deposits. Recommend fuel additive treatment.' },
        ]),
        recommendations: 'Use diesel fuel additive at next two refuels. Re-check emissions at next quarterly inspection.',
      },
    }),
  ]);
  console.log(`  ✅ Created ${roadworthyInspections.length} roadworthy inspections`);

  // ============================================================
  // 16. CLIENTS
  // ============================================================
  console.log('\n🏢 Creating clients...');

  const clientData = [
    // === Greater Accra Region ===
    {
      companyName: 'Kwame Hardware Store',
      contactPerson: 'Kwame Asiedu',
      email: 'kwamehardware@gmail.com',
      phone: '+233243456789',
      address: 'Mallam Junction, Accra',
      city: 'Accra',
      region: 'Greater Accra',
      notes: 'Retail hardware shop, cement & iron rods',
      isActive: true,
    },
    {
      companyName: 'Ama Building Materials',
      contactPerson: 'Ama Serwaa',
      email: 'amabuild@gmail.com',
      phone: '+233245567890',
      address: 'Spintex Road, Accra',
      city: 'Accra',
      region: 'Greater Accra',
      notes: 'Wholesale & retail building supplies',
      isActive: true,
    },
    {
      companyName: 'Tema Wholesale Depot',
      contactPerson: 'Emmanuel Tettey',
      email: 'temawholesale@yahoo.com',
      phone: '+233246678901',
      address: 'Tema Community 2 Market',
      city: 'Tema',
      region: 'Greater Accra',
      notes: 'Bulk distributor for consumer goods & food items',
      isActive: true,
    },
    // === Ashanti Region ===
    {
      companyName: 'Suame Magazine Building Supply',
      contactPerson: 'Kofi Boakye',
      email: 'suamesupply@gmail.com',
      phone: '+233322345678',
      address: 'Suame Magazine, Kumasi',
      city: 'Kumasi',
      region: 'Ashanti',
      notes: 'Construction materials, cement, blocks & sand',
      isActive: true,
    },
    {
      companyName: 'Kejetia General Goods',
      contactPerson: 'Adwoa Pokua',
      email: 'kejetiagoods@gmail.com',
      phone: '+233324456789',
      address: 'Kejetia Market, Kumasi',
      city: 'Kumasi',
      region: 'Ashanti',
      notes: 'General goods retailer, receives food & household items',
      isActive: true,
    },
    // === Western Region ===
    {
      companyName: 'Sekondi Builders Mart',
      contactPerson: 'Joseph Ackah',
      email: 'sekondimart@gmail.com',
      phone: '+233312345678',
      address: 'Market Circle, Sekondi-Takoradi',
      city: 'Sekondi-Takoradi',
      region: 'Western',
      notes: 'Building materials & hardware for Western Region',
      isActive: true,
    },
    {
      companyName: 'Takoradi Cold Store',
      contactPerson: 'Albert Mensah',
      email: 'takoradicold@gmail.com',
      phone: '+233247890123',
      address: 'Harbour Road, Takoradi',
      city: 'Sekondi-Takoradi',
      region: 'Western',
      notes: 'Frozen foods & fish distributor',
      isActive: true,
    },
    // === Central Region ===
    {
      companyName: 'Cape Coast Provision Store',
      contactPerson: 'Grace Thompson',
      email: 'ccprovision@gmail.com',
      phone: '+233332098765',
      address: 'Kotokuraba Market, Cape Coast',
      city: 'Cape Coast',
      region: 'Central',
      notes: 'Wholesale food provisions & household items',
      isActive: true,
    },
    // === Eastern Region ===
    {
      companyName: 'Koforidua Home Center',
      contactPerson: 'Daniel Osei',
      email: 'kfhomecenter@gmail.com',
      phone: '+233345678901',
      address: 'Koforidua Main Market',
      city: 'Koforidua',
      region: 'Eastern',
      notes: 'Home improvement & building supplies',
      isActive: true,
    },
    // === Northern Region ===
    {
      companyName: 'Tamale Central Market Store',
      contactPerson: 'Alhaji Ibrahim',
      email: 'tamalemarket@gmail.com',
      phone: '+233372123456',
      address: 'Central Market, Tamale',
      city: 'Tamale',
      region: 'Northern',
      notes: 'Food distributor, rice & flour bulk purchases',
      isActive: true,
    },
    {
      companyName: 'Savanna Construction Supply',
      contactPerson: 'Peter Wunzoya',
      email: 'savannasupply@gmail.com',
      phone: '+233372567890',
      address: 'Lamashegu, Tamale',
      city: 'Tamale',
      region: 'Northern',
      notes: 'Construction materials for Northern Region projects',
      isActive: true,
    },
    // === Volta Region ===
    {
      companyName: 'Ho Central Pharmacy & Store',
      contactPerson: 'Dr. Felicia Adza',
      email: 'hopharmacy@gmail.com',
      phone: '+233362345678',
      address: 'Ho Central Market',
      city: 'Ho',
      region: 'Volta',
      notes: 'Pharmaceutical & medical supply store',
      isActive: true,
    },
    // === Bono Region ===
    {
      companyName: 'Sunyani Building Materials Depot',
      contactPerson: 'Akosua Frimpong',
      email: 'sunyanidepot@gmail.com',
      phone: '+233352098765',
      address: 'Sunyani Main Market',
      city: 'Sunyani',
      region: 'Bono',
      notes: 'Cement, iron rods, and general hardware',
      isActive: true,
    },
    // === Bono East Region ===
    {
      companyName: 'Techiman Food & Provisions',
      contactPerson: 'Kwame Manu',
      email: 'techimanfood@gmail.com',
      phone: '+233353456789',
      address: 'Techiman Main Market',
      city: 'Techiman',
      region: 'Bono East',
      notes: 'Food distribution hub for middle belt',
      isActive: true,
    },
    // === Upper East Region ===
    {
      companyName: 'Bolgatanga Regional Food Store',
      contactPerson: 'Ayamga Abase',
      email: 'bolgafoodstore@gmail.com',
      phone: '+233382098765',
      address: 'Bolgatanga Market',
      city: 'Bolgatanga',
      region: 'Upper East',
      notes: 'Food & provisions for Upper East communities',
      isActive: true,
    },
    // === Upper West Region ===
    {
      companyName: 'Wa Home Supply Store',
      contactPerson: 'Issahaku Dramani',
      email: 'wahomesupply@gmail.com',
      phone: '+233392345678',
      address: 'Wa Central Market',
      city: 'Wa',
      region: 'Upper West',
      notes: 'General goods & provisions for Upper West',
      isActive: true,
    },
  ];

  const existingClients = await db.client.count();
  const clients = existingClients > 0
    ? await db.client.findMany()
    : await Promise.all(clientData.map((c) => db.client.create({ data: c })));
  console.log(`  ✅ Created ${clients.length} clients`);

  // ============================================================
  // 17. INVOICES & INVOICE ITEMS
  // ============================================================
  console.log('\n🧾 Creating invoices and invoice items...');

  const existingInvoices = await db.invoice.count();
  let invoices: Array<{ id: string; invoiceNumber: string; status: string }> = [];
  if (existingInvoices === 0) {
    const inv1 = await db.invoice.create({
      data: {
        invoiceNumber: 'INV-2025-001',
        clientId: clients[0].id,
        tripId: trips[0].id,
        issueDate: new Date('2025-01-06'),
        dueDate: new Date('2025-01-20'),
        status: 'paid',
        subtotal: 15000,
        taxRate: 15,
        taxAmount: 2250,
        totalAmount: 17250,
        paidAmount: 17250,
        terms: 'Net 14 days',
        notes: 'Cement delivery Accra to Kumasi - TRP-2024-001',
        items: {
          create: [
            { description: 'Freight: Accra to Kumasi (600 bags cement)', quantity: 1, unitPrice: 12000, total: 12000, order: 1 },
            { description: 'Fuel surcharge', quantity: 1, unitPrice: 2000, total: 2000, order: 2 },
            { description: 'Offloading assistance fee', quantity: 1, unitPrice: 1000, total: 1000, order: 3 },
          ],
        },
      },
    });

    const inv2 = await db.invoice.create({
      data: {
        invoiceNumber: 'INV-2025-002',
        clientId: clients[1].id,
        tripId: trips[2].id,
        issueDate: new Date('2025-01-08'),
        dueDate: new Date('2025-01-22'),
        status: 'paid',
        subtotal: 8500,
        taxRate: 15,
        taxAmount: 1275,
        totalAmount: 9775,
        paidAmount: 9775,
        terms: 'Net 14 days',
        notes: 'Flour delivery Takoradi to Accra - TRP-2024-003',
        items: {
          create: [
            { description: 'Freight: Takoradi to Accra (20 tonnes flour)', quantity: 1, unitPrice: 7500, total: 7500, order: 1 },
            { description: 'Refrigerated cargo handling', quantity: 1, unitPrice: 1000, total: 1000, order: 2 },
          ],
        },
      },
    });

    const inv3 = await db.invoice.create({
      data: {
        invoiceNumber: 'INV-2025-003',
        clientId: clients[2].id,
        tripId: trips[5].id,
        issueDate: new Date('2025-01-10'),
        dueDate: new Date('2025-02-10'),
        status: 'pending',
        subtotal: 12500,
        taxRate: 15,
        taxAmount: 1875,
        totalAmount: 14375,
        paidAmount: 0,
        terms: 'Net 30 days',
        notes: 'Cooking oil delivery Tema to Techiman - TRP-2024-006',
        items: {
          create: [
            { description: 'Freight: Tema to Techiman (18 tonnes cooking oil)', quantity: 1, unitPrice: 10000, total: 10000, order: 1 },
            { description: 'Toll charges (N1 + Kumasi-Accra)', quantity: 1, unitPrice: 1500, total: 1500, order: 2 },
            { description: 'Insurance surcharge', quantity: 1, unitPrice: 1000, total: 1000, order: 3 },
          ],
        },
      },
    });

    const inv4 = await db.invoice.create({
      data: {
        invoiceNumber: 'INV-2024-015',
        clientId: clients[3].id,
        tripId: trips[4].id,
        issueDate: new Date('2024-12-02'),
        dueDate: new Date('2024-12-16'),
        status: 'overdue',
        subtotal: 18500,
        taxRate: 15,
        taxAmount: 2775,
        totalAmount: 21275,
        paidAmount: 0,
        terms: 'Net 14 days - PAYMENT OVERDUE',
        notes: 'Cement delivery Accra to Kumasi - TRP-2024-005. Follow up required.',
        items: {
          create: [
            { description: 'Freight: Accra to Kumasi (800 bags cement)', quantity: 1, unitPrice: 15000, total: 15000, order: 1 },
            { description: 'Express delivery surcharge', quantity: 1, unitPrice: 2000, total: 2000, order: 2 },
            { description: 'Weekend loading fee', quantity: 1, unitPrice: 1500, total: 1500, order: 3 },
          ],
        },
      },
    });

    invoices = [inv1, inv2, inv3, inv4];
  } else {
    invoices = await db.invoice.findMany({ select: { id: true, invoiceNumber: true, status: true } });
  }
  console.log(`  ✅ Created ${invoices.length} invoices with items`);

  // ============================================================
  // 18. FUEL BUDGETS
  // ============================================================
  console.log('\n⛽ Creating fuel budgets...');

  const existingFuelBudgets = await db.fuelBudget.count();
  const fuelBudgets = existingFuelBudgets > 0 ? [] : await Promise.all([
    db.fuelBudget.upsert({
      where: { truckId_month_year: { truckId: truck1.id, month: 1, year: 2025 } },
      update: {},
      create: {
        truckId: truck1.id,
        month: 1,
        year: 2025,
        budgetLimit: 5000,
        litersLimit: 800,
        actualSpend: 2850,
        actualLiters: 380,
        notes: 'January 2025 budget for Accra-Kumasi routes',
        createdBy: adminUser.id,
      },
    }),
    db.fuelBudget.upsert({
      where: { truckId_month_year: { truckId: truck2.id, month: 1, year: 2025 } },
      update: {},
      create: {
        truckId: truck2.id,
        month: 1,
        year: 2025,
        budgetLimit: 6500,
        litersLimit: 1000,
        actualSpend: 0,
        actualLiters: 0,
        notes: 'January 2025 budget for long-distance routes',
        createdBy: adminUser.id,
      },
    }),
    db.fuelBudget.upsert({
      where: { truckId_month_year: { truckId: truck5.id, month: 12, year: 2024 } },
      update: {},
      create: {
        truckId: truck5.id,
        month: 12,
        year: 2024,
        budgetLimit: 4500,
        litersLimit: 700,
        actualSpend: 3450,
        actualLiters: 460,
        notes: 'December 2024 budget — 77% utilised',
        createdBy: managerUser.id,
      },
    }),
    db.fuelBudget.upsert({
      where: { truckId_month_year: { truckId: truck6.id, month: 12, year: 2024 } },
      update: {},
      create: {
        truckId: truck6.id,
        month: 12,
        year: 2024,
        budgetLimit: 3500,
        litersLimit: 550,
        actualSpend: 2700,
        actualLiters: 360,
        notes: 'December 2024 budget — 77% utilised',
        createdBy: managerUser.id,
      },
    }),
  ]);
  console.log(`  ✅ Created ${fuelBudgets.length} fuel budgets`);

  // ============================================================
  // 19. TRIP EVENTS
  // ============================================================
  console.log('\n📝 Creating trip events...');

  const existingTripEvents = await db.tripEvent.count();
  const tripEvents = existingTripEvents > 0 ? [] : await Promise.all([
    db.tripEvent.create({
      data: {
        tripId: trips[10].id, // TRP-2025-011 (in_transit)
        fromStatus: 'scheduled',
        toStatus: 'loading',
        userId: adminUser.id,
        notes: 'Truck assigned, driver notified. Loading 16mm iron rods at Tema Port.',
        location: 'Tema Port, Accra',
        createdAt: new Date('2025-01-10T03:30:00'),
      },
    }),
    db.tripEvent.create({
      data: {
        tripId: trips[10].id, // TRP-2025-011 (in_transit)
        fromStatus: 'loading',
        toStatus: 'loaded',
        userId: driverUser1.id,
        notes: 'All 20 tonnes loaded and secured. Departing to Tamale.',
        location: 'Tema Port, Accra',
        metadata: JSON.stringify({ quantity: 20, unit: 'tonnes' }),
        createdAt: new Date('2025-01-10T04:00:00'),
      },
    }),
    db.tripEvent.create({
      data: {
        tripId: trips[10].id, // TRP-2025-011 (in_transit)
        fromStatus: 'loaded',
        toStatus: 'in_transit',
        userId: driverUser1.id,
        notes: 'Departed Tema Port. ETA Tamale: 18:00. Taking N1 through Kumasi.',
        location: 'Tema Motorway',
        createdAt: new Date('2025-01-10T04:15:00'),
      },
    }),
    db.tripEvent.create({
      data: {
        tripId: trips[12].id, // TRP-2025-013 (loading)
        fromStatus: 'scheduled',
        toStatus: 'loading',
        userId: adminUser.id,
        notes: 'Loading cooking oil barrels at Tema Free Zone warehouse.',
        location: 'Tema Free Zone',
        createdAt: new Date('2025-01-10T08:00:00'),
      },
    }),
  ]);
  console.log(`  ✅ Created ${tripEvents.length} trip events`);

  // ============================================================
  // 20. DELIVERY STOPS
  // ============================================================
  console.log('\n📍 Creating delivery stops...');

  const existingStops = await db.deliveryStop.count();
  const deliveryStops = existingStops > 0 ? [] : await Promise.all([
    db.deliveryStop.create({
      data: {
        tripId: trips[10].id, // TRP-2025-011 (in_transit to Tamale)
        stopOrder: 1,
        destination: 'Kumasi',
        address: 'Suame Magazine, Kumasi',
        lat: 6.6833,
        lng: -1.6614,
        customerName: 'Suame Building Materials',
        customerPhone: '+233322345678',
        expectedQty: 8,
        unit: 'tonnes',
        status: 'completed',
        arrivalTime: new Date('2025-01-10T09:30:00'),
        offloadStarted: new Date('2025-01-10T09:45:00'),
        offloadCompleted: new Date('2025-01-10T10:30:00'),
        actualQty: 8,
        notes: 'Partial offload at Kumasi depot',
      },
    }),
    db.deliveryStop.create({
      data: {
        tripId: trips[10].id, // TRP-2025-011 (in_transit to Tamale)
        stopOrder: 2,
        destination: 'Tamale',
        address: 'Tamale Logistics Hub, Bolgatanga Road',
        lat: 9.4034,
        lng: -0.8393,
        customerName: 'Savanna Construction Ltd',
        customerPhone: '+233372345678',
        expectedQty: 12,
        unit: 'tonnes',
        status: 'pending',
        notes: 'Final delivery stop — remaining 12 tonnes',
      },
    }),
    db.deliveryStop.create({
      data: {
        tripId: trips[11].id, // TRP-2025-012 (loading)
        stopOrder: 1,
        destination: 'Techiman',
        address: 'Techiman Main Market',
        lat: 7.5833,
        lng: -1.9333,
        customerName: 'Bono East Trading Co.',
        customerPhone: '+233352098765',
        expectedQty: 18,
        unit: 'tonnes',
        status: 'pending',
        notes: 'Single drop — full cargo to Techiman',
      },
    }),
    db.deliveryStop.create({
      data: {
        tripId: trips[13].id, // TRP-2025-014 (offloading)
        stopOrder: 1,
        destination: 'Koforidua',
        address: 'Koforidua Industrial Area',
        lat: 6.0941,
        lng: -0.2610,
        customerName: 'Eastern Distribution Ltd',
        customerPhone: '+233342567890',
        expectedQty: 200,
        unit: 'bags',
        status: 'completed',
        arrivalTime: new Date('2025-01-10T11:00:00'),
        offloadStarted: new Date('2025-01-10T11:15:00'),
        offloadCompleted: new Date('2025-01-10T12:00:00'),
        actualQty: 200,
        notes: 'Full offload completed successfully',
      },
    }),
  ]);
  console.log(`  ✅ Created ${deliveryStops.length} delivery stops`);

  // ============================================================
  // 21. TRACKING CONFIGS
  // ============================================================
  console.log('\n📡 Creating tracking configs...');

  const trackingConfigs = await Promise.all([
    db.trackingConfig.upsert({
      where: { truckId: truck1.id },
      update: {},
      create: {
        truckId: truck1.id,
        enablePhoneGps: true,
        enableHardware: true,
        updateInterval: 10,
        geofenceRadius: 500,
        isActive: true,
      },
    }),
    db.trackingConfig.upsert({
      where: { truckId: truck2.id },
      update: {},
      create: {
        truckId: truck2.id,
        enablePhoneGps: true,
        enableHardware: true,
        updateInterval: 15,
        geofenceRadius: 500,
        isActive: true,
      },
    }),
    db.trackingConfig.upsert({
      where: { truckId: truck6.id },
      update: {},
      create: {
        truckId: truck6.id,
        enablePhoneGps: true,
        enableHardware: false,
        updateInterval: 30,
        geofenceRadius: 300,
        isActive: true,
      },
    }),
    db.trackingConfig.upsert({
      where: { truckId: truck4.id },
      update: {},
      create: {
        truckId: truck4.id,
        enablePhoneGps: false,
        enableHardware: false,
        updateInterval: 30,
        geofenceRadius: 500,
        isActive: false,
      },
    }),
  ]);
  console.log(`  ✅ Created ${trackingConfigs.length} tracking configs`);

  // ============================================================
  // LOCATION HIERARCHY: LOADING CITIES, LOADING POINTS,
  // DESTINATION CITIES, DESTINATION ZONES, ZONE RATES, BENCHMARKS
  // ============================================================
  console.log('\n📍 Creating location hierarchy...');

  // --- 1. LOADING CITIES ---
  const existingLoadingCities = await db.loadingCity.findMany();
  const existingLCNames = existingLoadingCities.map(c => c.name);

  const loadingCitiesToCreate = [
    { name: 'Tema', region: 'Greater Accra' },
    { name: 'Takoradi', region: 'Western' },
    { name: 'Kumasi', region: 'Ashanti' },
  ].filter(c => !existingLCNames.includes(c.name));

  if (loadingCitiesToCreate.length > 0) {
    await db.loadingCity.createMany({ data: loadingCitiesToCreate });
  }

  const temaCity = await db.loadingCity.findFirst({ where: { name: 'Tema' } });
  const takoradiCity = await db.loadingCity.findFirst({ where: { name: 'Takoradi' } });
  const kumasiLCity = await db.loadingCity.findFirst({ where: { name: 'Kumasi' } });
  console.log(`  ✅ Loading cities created/found: Tema, Takoradi, Kumasi`);

  // --- 2. LOADING POINTS ---
  const loadingPointsData = [
    // Tema loading points
    { loadingCityId: temaCity!.id, name: 'GHACEM', address: 'Tema Harbour, Free Zone Area', contactPerson: 'Operations Manager', contactPhone: '+233302012345' },
    { loadingCityId: temaCity!.id, name: 'UNILEVER', address: 'Tema Heavy Industrial Area', contactPerson: 'Logistics Coordinator', contactPhone: '+233302067890' },
    { loadingCityId: temaCity!.id, name: 'DZATA CEMENT LTD', address: 'Tema Free Zones, Plot 12', contactPerson: 'Warehouse Supervisor', contactPhone: '+233302034567' },
    { loadingCityId: temaCity!.id, name: 'DIAMOND CEMENT', address: 'Tema Industrial Area, Block B', contactPerson: 'Despatch Clerk', contactPhone: '+233302089012' },
    // Takoradi loading points
    { loadingCityId: takoradiCity!.id, name: 'GHACEM Takoradi', address: 'Takoradi Port, Harbour Road', contactPerson: 'Branch Manager', contactPhone: '+233312045678' },
    { loadingCityId: takoradiCity!.id, name: 'HOLCIM', address: 'Takoradi Industrial Estate', contactPerson: 'Plant Supervisor', contactPhone: '+233312056789' },
    { loadingCityId: takoradiCity!.id, name: 'CBI GHANA', address: 'Sekondi-Takoradi, Kansaworodo', contactPerson: 'Logistics Lead', contactPhone: '+233312067890' },
    // Kumasi loading points
    { loadingCityId: kumasiLCity!.id, name: 'GHACEM Kumasi', address: 'Kumasi Kaase Industrial Area', contactPerson: 'Depot Manager', contactPhone: '+233322078901' },
    { loadingCityId: kumasiLCity!.id, name: 'SUPREME CONCRETE', address: 'Kumasi Sofoline Industrial', contactPerson: 'Operations Head', contactPhone: '+233322089012' },
    { loadingCityId: kumasiLCity!.id, name: 'BUILDRIGHT', address: 'Kumasi Ahodwo, Light Industrial', contactPerson: 'Warehouse Manager', contactPhone: '+233322090123' },
  ];

  const allLoadingPoints = await Promise.all(
    loadingPointsData.map(lp =>
      db.loadingPoint.upsert({
        where: { name_loadingCityId: { name: lp.name, loadingCityId: lp.loadingCityId } },
        update: {},
        create: lp,
      })
    )
  );
  console.log(`  ✅ Created ${allLoadingPoints.length} loading points`);

  // --- 3. DESTINATION CITIES ---
  const existingDestCities = await db.destinationCity.findMany();
  const existingDCNames = existingDestCities.map(c => c.name);

  const destCitiesToCreate = [
    // Greater Accra Region
    { name: 'Accra', region: 'Greater Accra' },
    // Ashanti Region
    { name: 'Kumasi', region: 'Ashanti' },
    // Western Region
    { name: 'Sekondi-Takoradi', region: 'Western' },
    // Eastern Region
    { name: 'Koforidua', region: 'Eastern' },
    // Central Region
    { name: 'Cape Coast', region: 'Central' },
    // Northern Region
    { name: 'Tamale', region: 'Northern' },
    // Volta Region
    { name: 'Ho', region: 'Volta' },
    // Upper East Region
    { name: 'Bolgatanga', region: 'Upper East' },
    // Upper West Region
    { name: 'Wa', region: 'Upper West' },
    // Bono Region
    { name: 'Sunyani', region: 'Bono' },
    // Bono East Region
    { name: 'Techiman', region: 'Bono East' },
    // Ahafo Region
    { name: 'Goaso', region: 'Ahafo' },
    // Savannah Region
    { name: 'Damongo', region: 'Savannah' },
    // North East Region
    { name: 'Nalerigu', region: 'North East' },
    // Oti Region
    { name: 'Dambai', region: 'Oti' },
    // Western North Region
    { name: 'Sefwi-Wiawso', region: 'Western North' },
  ].filter(c => !existingDCNames.includes(c.name));

  if (destCitiesToCreate.length > 0) {
    await db.destinationCity.createMany({ data: destCitiesToCreate });
  }

  const accraCity = await db.destinationCity.findFirst({ where: { name: 'Accra' } });
  const kumasiDCity = await db.destinationCity.findFirst({ where: { name: 'Kumasi' } });
  const takoradiDCity = await db.destinationCity.findFirst({ where: { name: 'Sekondi-Takoradi' } });
  const koforiduaCity = await db.destinationCity.findFirst({ where: { name: 'Koforidua' } });
  const capeCoastCity = await db.destinationCity.findFirst({ where: { name: 'Cape Coast' } });
  const tamaleCity = await db.destinationCity.findFirst({ where: { name: 'Tamale' } });
  const hoCity = await db.destinationCity.findFirst({ where: { name: 'Ho' } });
  const bolgaCity = await db.destinationCity.findFirst({ where: { name: 'Bolgatanga' } });
  const waCity = await db.destinationCity.findFirst({ where: { name: 'Wa' } });
  const sunyaniCity = await db.destinationCity.findFirst({ where: { name: 'Sunyani' } });
  const techimanCity = await db.destinationCity.findFirst({ where: { name: 'Techiman' } });
  const goasoCity = await db.destinationCity.findFirst({ where: { name: 'Goaso' } });
  const damongoCity = await db.destinationCity.findFirst({ where: { name: 'Damongo' } });
  const naleriguCity = await db.destinationCity.findFirst({ where: { name: 'Nalerigu' } });
  const dambaiCity = await db.destinationCity.findFirst({ where: { name: 'Dambai' } });
  const wiawsoCity = await db.destinationCity.findFirst({ where: { name: 'Sefwi-Wiawso' } });
  console.log(`  ✅ Destination cities created/found: 16 cities (all Ghana regions)`);

  // --- 4. DESTINATION ZONES ---
  const zonesData = [
    // ── Greater Accra: Accra ──
    { destinationCityId: accraCity!.id, name: 'Lapaz' },
    { destinationCityId: accraCity!.id, name: 'Kasoa' },
    { destinationCityId: accraCity!.id, name: 'Achimota' },
    { destinationCityId: accraCity!.id, name: 'Spintex' },
    { destinationCityId: accraCity!.id, name: 'Tema Industrial Area' },
    { destinationCityId: accraCity!.id, name: 'Madina' },
    { destinationCityId: accraCity!.id, name: 'East Legon' },
    // ── Ashanti: Kumasi ──
    { destinationCityId: kumasiDCity!.id, name: 'Asokwa' },
    { destinationCityId: kumasiDCity!.id, name: 'Kejetia' },
    { destinationCityId: kumasiDCity!.id, name: 'Suame' },
    { destinationCityId: kumasiDCity!.id, name: 'Bantama' },
    { destinationCityId: kumasiDCity!.id, name: 'Ahodwo' },
    // ── Western: Sekondi-Takoradi ──
    { destinationCityId: takoradiDCity!.id, name: 'Market Circle' },
    { destinationCityId: takoradiDCity!.id, name: 'Beach Road' },
    { destinationCityId: takoradiDCity!.id, name: 'Essikado' },
    { destinationCityId: takoradiDCity!.id, name: 'Takoradi Airport Area' },
    // ── Eastern: Koforidua ──
    { destinationCityId: koforiduaCity!.id, name: 'Koforidua Central' },
    { destinationCityId: koforiduaCity!.id, name: 'Suhum' },
    { destinationCityId: koforiduaCity!.id, name: 'Nkawkaw' },
    // ── Central: Cape Coast ──
    { destinationCityId: capeCoastCity!.id, name: 'Kotokuraba' },
    { destinationCityId: capeCoastCity!.id, name: 'Pedu' },
    { destinationCityId: capeCoastCity!.id, name: 'Moree' },
    // ── Northern: Tamale ──
    { destinationCityId: tamaleCity!.id, name: 'Central Business District' },
    { destinationCityId: tamaleCity!.id, name: 'Lamashegu' },
    { destinationCityId: tamaleCity!.id, name: 'Kakpayili' },
    // ── Volta: Ho ──
    { destinationCityId: hoCity!.id, name: 'Ho Central' },
    { destinationCityId: hoCity!.id, name: 'Hohoe' },
    { destinationCityId: hoCity!.id, name: 'Aflao' },
    // ── Upper East: Bolgatanga ──
    { destinationCityId: bolgaCity!.id, name: 'Bolga Central' },
    { destinationCityId: bolgaCity!.id, name: 'Zuarungu' },
    { destinationCityId: bolgaCity!.id, name: 'Soe' },
    // ── Upper West: Wa ──
    { destinationCityId: waCity!.id, name: 'Kpaguri' },
    { destinationCityId: waCity!.id, name: 'Jirapa Road' },
    { destinationCityId: waCity!.id, name: 'Dondoli' },
    // ── Bono: Sunyani ──
    { destinationCityId: sunyaniCity!.id, name: 'Fiapre' },
    { destinationCityId: sunyaniCity!.id, name: 'Area 3' },
    { destinationCityId: sunyaniCity!.id, name: 'Abesim' },
    // ── Bono East: Techiman ──
    { destinationCityId: techimanCity!.id, name: 'Techiman Market' },
    { destinationCityId: techimanCity!.id, name: 'Nkoranza' },
    { destinationCityId: techimanCity!.id, name: 'Kintampo' },
    // ── Ahafo: Goaso ──
    { destinationCityId: goasoCity!.id, name: 'Goaso Central' },
    { destinationCityId: goasoCity!.id, name: 'Mim' },
    { destinationCityId: goasoCity!.id, name: 'Hwidiem' },
    // ── Savannah: Damongo ──
    { destinationCityId: damongoCity!.id, name: 'Damongo Central' },
    { destinationCityId: damongoCity!.id, name: 'Buipe' },
    { destinationCityId: damongoCity!.id, name: 'Sawla' },
    // ── North East: Nalerigu ──
    { destinationCityId: naleriguCity!.id, name: 'Nalerigu Central' },
    { destinationCityId: naleriguCity!.id, name: 'Gambaga' },
    { destinationCityId: naleriguCity!.id, name: 'Bunkpurugu' },
    // ── Oti: Dambai ──
    { destinationCityId: dambaiCity!.id, name: 'Dambai Central' },
    { destinationCityId: dambaiCity!.id, name: 'Jasikan' },
    { destinationCityId: dambaiCity!.id, name: 'Krachi' },
    // ── Western North: Sefwi-Wiawso ──
    { destinationCityId: wiawsoCity!.id, name: 'Wiawso Central' },
    { destinationCityId: wiawsoCity!.id, name: 'Sefwi Bekwai' },
    { destinationCityId: wiawsoCity!.id, name: 'Enchi' },
  ];

  const allZones = await Promise.all(
    zonesData.map(z =>
      db.destinationZone.upsert({
        where: { name_destinationCityId: { name: z.name, destinationCityId: z.destinationCityId } },
        update: {},
        create: z,
      })
    )
  );
  console.log(`  ✅ Created ${allZones.length} destination zones`);

  // Build a lookup map: zone name -> zone ID
  const zoneMap = new Map(allZones.map(z => [z.name, z.id]));

  // --- 5. ZONE RATES ---
  // Rates assume loading from Tema (primary cement hub). Distances are round-trip km from Tema.
  const zoneRatesData: { destinationZoneId: string; rateAmount: number; minMileage: number; maxMileage: number; expectedFuelConsumption: number }[] = [
    // Accra zones (30-80 km from Tema): 800-2500 GHS
    { destinationZoneId: zoneMap.get('Lapaz')!, rateAmount: 800, minMileage: 30, maxMileage: 50, expectedFuelConsumption: 45 },
    { destinationZoneId: zoneMap.get('Kasoa')!, rateAmount: 900, minMileage: 45, maxMileage: 65, expectedFuelConsumption: 55 },
    { destinationZoneId: zoneMap.get('Achimota')!, rateAmount: 1000, minMileage: 40, maxMileage: 60, expectedFuelConsumption: 50 },
    { destinationZoneId: zoneMap.get('Spintex')!, rateAmount: 850, minMileage: 25, maxMileage: 45, expectedFuelConsumption: 40 },
    { destinationZoneId: zoneMap.get('Tema Industrial Area')!, rateAmount: 800, minMileage: 10, maxMileage: 30, expectedFuelConsumption: 30 },
    { destinationZoneId: zoneMap.get('Madina')!, rateAmount: 1200, minMileage: 55, maxMileage: 80, expectedFuelConsumption: 65 },
    { destinationZoneId: zoneMap.get('East Legon')!, rateAmount: 1500, minMileage: 60, maxMileage: 85, expectedFuelConsumption: 70 },

    // Kumasi zones (250-300 km from Tema): 1500-2500 GHS
    { destinationZoneId: zoneMap.get('Asokwa')!, rateAmount: 2200, minMileage: 250, maxMileage: 280, expectedFuelConsumption: 180 },
    { destinationZoneId: zoneMap.get('Kejetia')!, rateAmount: 2500, minMileage: 260, maxMileage: 300, expectedFuelConsumption: 190 },
    { destinationZoneId: zoneMap.get('Suame')!, rateAmount: 2000, minMileage: 240, maxMileage: 270, expectedFuelConsumption: 175 },
    { destinationZoneId: zoneMap.get('Bantama')!, rateAmount: 2300, minMileage: 255, maxMileage: 290, expectedFuelConsumption: 185 },
    { destinationZoneId: zoneMap.get('Ahodwo')!, rateAmount: 2400, minMileage: 260, maxMileage: 295, expectedFuelConsumption: 188 },

    // Tamale zones (600-700 km from Tema): 3000-4000 GHS
    { destinationZoneId: zoneMap.get('Central Business District')!, rateAmount: 3500, minMileage: 600, maxMileage: 650, expectedFuelConsumption: 400 },
    { destinationZoneId: zoneMap.get('Lamashegu')!, rateAmount: 3200, minMileage: 580, maxMileage: 630, expectedFuelConsumption: 385 },
    { destinationZoneId: zoneMap.get('Kakpayili')!, rateAmount: 4000, minMileage: 640, maxMileage: 700, expectedFuelConsumption: 420 },

    // Takoradi zones (200-230 km from Tema): 1200-2500 GHS
    { destinationZoneId: zoneMap.get('Market Circle')!, rateAmount: 1800, minMileage: 200, maxMileage: 215, expectedFuelConsumption: 150 },
    { destinationZoneId: zoneMap.get('Beach Road')!, rateAmount: 1500, minMileage: 190, maxMileage: 210, expectedFuelConsumption: 140 },
    { destinationZoneId: zoneMap.get('Essikado')!, rateAmount: 2500, minMileage: 210, maxMileage: 230, expectedFuelConsumption: 160 },
    { destinationZoneId: zoneMap.get('Takoradi Airport Area')!, rateAmount: 2000, minMileage: 195, maxMileage: 220, expectedFuelConsumption: 145 },

    // Koforidua zones (90-130 km from Tema): 1200-1800 GHS
    { destinationZoneId: zoneMap.get('Koforidua Central')!, rateAmount: 1400, minMileage: 90, maxMileage: 110, expectedFuelConsumption: 80 },
    { destinationZoneId: zoneMap.get('Suhum')!, rateAmount: 1300, minMileage: 80, maxMileage: 100, expectedFuelConsumption: 70 },
    { destinationZoneId: zoneMap.get('Nkawkaw')!, rateAmount: 1800, minMileage: 120, maxMileage: 140, expectedFuelConsumption: 100 },

    // Cape Coast zones (150-170 km from Tema): 1800-2200 GHS
    { destinationZoneId: zoneMap.get('Kotokuraba')!, rateAmount: 1900, minMileage: 150, maxMileage: 165, expectedFuelConsumption: 120 },
    { destinationZoneId: zoneMap.get('Pedu')!, rateAmount: 1800, minMileage: 145, maxMileage: 160, expectedFuelConsumption: 115 },
    { destinationZoneId: zoneMap.get('Moree')!, rateAmount: 2200, minMileage: 160, maxMileage: 175, expectedFuelConsumption: 130 },

    // Tamale zones (600-700 km from Tema): 3000-4000 GHS
    { destinationZoneId: zoneMap.get('Central Business District')!, rateAmount: 3500, minMileage: 600, maxMileage: 650, expectedFuelConsumption: 400 },
    { destinationZoneId: zoneMap.get('Lamashegu')!, rateAmount: 3200, minMileage: 580, maxMileage: 630, expectedFuelConsumption: 385 },
    { destinationZoneId: zoneMap.get('Kakpayili')!, rateAmount: 4000, minMileage: 640, maxMileage: 700, expectedFuelConsumption: 420 },

    // Ho zones (170-210 km from Tema): 1500-2200 GHS
    { destinationZoneId: zoneMap.get('Ho Central')!, rateAmount: 1800, minMileage: 170, maxMileage: 190, expectedFuelConsumption: 130 },
    { destinationZoneId: zoneMap.get('Hohoe')!, rateAmount: 2000, minMileage: 190, maxMileage: 210, expectedFuelConsumption: 145 },
    { destinationZoneId: zoneMap.get('Aflao')!, rateAmount: 2200, minMileage: 200, maxMileage: 230, expectedFuelConsumption: 155 },

    // Bolgatanga zones (650-750 km from Tema): 3800-4500 GHS
    { destinationZoneId: zoneMap.get('Bolga Central')!, rateAmount: 4000, minMileage: 650, maxMileage: 690, expectedFuelConsumption: 430 },
    { destinationZoneId: zoneMap.get('Zuarungu')!, rateAmount: 4500, minMileage: 700, maxMileage: 750, expectedFuelConsumption: 460 },
    { destinationZoneId: zoneMap.get('Soe')!, rateAmount: 3800, minMileage: 640, maxMileage: 680, expectedFuelConsumption: 420 },

    // Wa zones (550-600 km from Tema): 3500-4000 GHS
    { destinationZoneId: zoneMap.get('Kpaguri')!, rateAmount: 3700, minMileage: 550, maxMileage: 575, expectedFuelConsumption: 380 },
    { destinationZoneId: zoneMap.get('Jirapa Road')!, rateAmount: 3500, minMileage: 540, maxMileage: 565, expectedFuelConsumption: 370 },
    { destinationZoneId: zoneMap.get('Dondoli')!, rateAmount: 4000, minMileage: 570, maxMileage: 600, expectedFuelConsumption: 395 },

    // Sunyani zones (400-430 km from Tema): 2500-3500 GHS
    { destinationZoneId: zoneMap.get('Fiapre')!, rateAmount: 2800, minMileage: 400, maxMileage: 420, expectedFuelConsumption: 280 },
    { destinationZoneId: zoneMap.get('Area 3')!, rateAmount: 2500, minMileage: 390, maxMileage: 410, expectedFuelConsumption: 270 },
    { destinationZoneId: zoneMap.get('Abesim')!, rateAmount: 3500, minMileage: 410, maxMileage: 435, expectedFuelConsumption: 295 },

    // Techiman zones (350-400 km from Tema): 2500-3200 GHS
    { destinationZoneId: zoneMap.get('Techiman Market')!, rateAmount: 2800, minMileage: 360, maxMileage: 380, expectedFuelConsumption: 250 },
    { destinationZoneId: zoneMap.get('Nkoranza')!, rateAmount: 3000, minMileage: 370, maxMileage: 390, expectedFuelConsumption: 260 },
    { destinationZoneId: zoneMap.get('Kintampo')!, rateAmount: 3200, minMileage: 380, maxMileage: 410, expectedFuelConsumption: 270 },

    // Goaso zones (420-470 km from Tema): 2800-3800 GHS
    { destinationZoneId: zoneMap.get('Goaso Central')!, rateAmount: 3200, minMileage: 420, maxMileage: 445, expectedFuelConsumption: 295 },
    { destinationZoneId: zoneMap.get('Mim')!, rateAmount: 3000, minMileage: 410, maxMileage: 435, expectedFuelConsumption: 285 },
    { destinationZoneId: zoneMap.get('Hwidiem')!, rateAmount: 3500, minMileage: 430, maxMileage: 460, expectedFuelConsumption: 310 },

    // Damongo zones (580-640 km from Tema): 3200-4200 GHS
    { destinationZoneId: zoneMap.get('Damongo Central')!, rateAmount: 3800, minMileage: 580, maxMileage: 610, expectedFuelConsumption: 390 },
    { destinationZoneId: zoneMap.get('Buipe')!, rateAmount: 3600, minMileage: 560, maxMileage: 590, expectedFuelConsumption: 375 },
    { destinationZoneId: zoneMap.get('Sawla')!, rateAmount: 4200, minMileage: 610, maxMileage: 645, expectedFuelConsumption: 410 },

    // Nalerigu zones (620-680 km from Tema): 3500-4300 GHS
    { destinationZoneId: zoneMap.get('Nalerigu Central')!, rateAmount: 3800, minMileage: 620, maxMileage: 650, expectedFuelConsumption: 410 },
    { destinationZoneId: zoneMap.get('Gambaga')!, rateAmount: 3600, minMileage: 600, maxMileage: 635, expectedFuelConsumption: 395 },
    { destinationZoneId: zoneMap.get('Bunkpurugu')!, rateAmount: 4300, minMileage: 650, maxMileage: 685, expectedFuelConsumption: 425 },

    // Dambai zones (400-470 km from Tema): 2800-3800 GHS
    { destinationZoneId: zoneMap.get('Dambai Central')!, rateAmount: 3200, minMileage: 400, maxMileage: 430, expectedFuelConsumption: 280 },
    { destinationZoneId: zoneMap.get('Jasikan')!, rateAmount: 3500, minMileage: 420, maxMileage: 450, expectedFuelConsumption: 300 },
    { destinationZoneId: zoneMap.get('Krachi')!, rateAmount: 3800, minMileage: 440, maxMileage: 475, expectedFuelConsumption: 320 },

    // Sefwi-Wiawso zones (280-340 km from Tema): 2200-3200 GHS
    { destinationZoneId: zoneMap.get('Wiawso Central')!, rateAmount: 2800, minMileage: 300, maxMileage: 325, expectedFuelConsumption: 220 },
    { destinationZoneId: zoneMap.get('Sefwi Bekwai')!, rateAmount: 2600, minMileage: 280, maxMileage: 310, expectedFuelConsumption: 210 },
    { destinationZoneId: zoneMap.get('Enchi')!, rateAmount: 3200, minMileage: 320, maxMileage: 345, expectedFuelConsumption: 240 },
  ];

  const zoneRates = await Promise.all(
    zoneRatesData.map(zr =>
      db.zoneRate.create({
        data: zr,
      })
    )
  );
  console.log(`  ✅ Created ${zoneRates.length} zone rates`);

  // --- 6. PERFORMANCE BENCHMARKS ---
  const benchmarksData = zoneRatesData.map(zr => ({
    destinationZoneId: zr.destinationZoneId,
    expectedMinMileage: zr.minMileage,
    expectedMaxMileage: zr.maxMileage,
    warningMinMileage: Math.round(zr.minMileage * 0.9),
    warningMaxMileage: Math.round(zr.maxMileage * 1.1),
    expectedMinFuel: Math.round(zr.expectedFuelConsumption * 0.85),
    expectedMaxFuel: Math.round(zr.expectedFuelConsumption * 1.15),
    warningMinFuel: Math.round(zr.expectedFuelConsumption * 0.7),
    warningMaxFuel: Math.round(zr.expectedFuelConsumption * 1.3),
  }));

  const benchmarks = await Promise.all(
    benchmarksData.map(b =>
      db.performanceBenchmark.create({ data: b })
    )
  );
  console.log(`  ✅ Created ${benchmarks.length} performance benchmarks`);

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n✅ ========================================');
  console.log('   SEED DATA COMPLETE');
  console.log('   ========================================');
  console.log(`   Roles:          ${roles.length}`);
  console.log(`   Users:          ${[adminUser, managerUser, driverUser1, driverUser2].length}`);
  console.log(`   Drivers:        ${drivers.length}`);
  console.log(`   Trucks:         ${trucks.length}`);
  console.log(`   Tyres:          ${tyres.length}`);
  console.log(`   Insurance:      ${insurance.length}`);
  console.log(`   Trips:          ${trips.length}`);
  console.log(`   Fuel Logs:      ${fuelLogs.length}`);
  console.log(`   Maintenance:    ${maintenanceRecords.length}`);
  console.log(`   Expenses:       ${expenses.length}`);
  console.log(`   Pricing:        ${pricing.length}`);
  console.log(`   Payroll:        ${payroll.length}`);
  console.log(`   Notifications:  ${notifications.length}`);
  console.log(`   DVLA Regs:      ${dvlaRegistrations.length}`);
  console.log(`   Roadworthy:     ${roadworthyInspections.length}`);
  console.log(`   Clients:        ${clients.length}`);
  console.log(`   Invoices:       ${invoices.length}`);
  console.log(`   Fuel Budgets:   ${fuelBudgets.length}`);
  console.log(`   Trip Events:    ${tripEvents.length}`);
  console.log(`   Delivery Stops: ${deliveryStops.length}`);
  console.log(`   Tracking Configs: ${trackingConfigs.length}`);
  console.log(`   Loading Cities:  3`);
  console.log(`   Loading Points: ${allLoadingPoints.length}`);
  console.log(`   Dest Cities:    16 (all Ghana regions)`);
  console.log(`   Dest Zones:     ${allZones.length}`);
  console.log(`   Zone Rates:     ${zoneRates.length}`);
  console.log(`   Benchmarks:     ${benchmarks.length}`);
  console.log('   ========================================\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
