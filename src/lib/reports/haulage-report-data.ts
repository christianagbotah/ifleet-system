import { db } from '@/lib/db'
import type { HaulageReportFact, HaulageReportFamily, HaulageReportFilters } from '@/lib/domain/reports/haulage-reports'

const MAX_ROWS = 5000

function n(value: unknown): number {
  if (value == null) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function tonneQuantity(quantity: number, unit: string) {
  const normalized = unit.trim().toLowerCase()
  return ['t', 'tonne', 'tonnes', 'metric tonne', 'metric tonnes'].includes(normalized) ? quantity : 0
}

function dateWhere(filters: HaulageReportFilters) {
  if (!filters.dateFrom && !filters.dateTo) return undefined
  return {
    ...(filters.dateFrom ? { gte: new Date(`${filters.dateFrom}T00:00:00.000Z`) } : {}),
    ...(filters.dateTo ? { lte: new Date(`${filters.dateTo}T23:59:59.999Z`) } : {}),
  }
}

type TripDim = {
  id: string
  shipperId: string | null
  transporterId: string | null
  vehicleId: string
  driverId: string
  route: string
  plateNumber: string
  driverName: string
  shipperName: string
  customerName: string
}

async function tripDimensions(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return new Map<string, TripDim>()
  const trips = await db.trip.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      loadingLocation: true,
      destination: true,
      customerName: true,
      driverId: true,
      truckId: true,
      truck: { select: { plateNumber: true, transporterId: true } },
      driver: { select: { firstName: true, lastName: true } },
      loadOrder: { select: { shipperProfileId: true, shipperProfile: { select: { name: true } } } },
    },
  })
  return new Map(trips.map((trip) => [trip.id, {
    id: trip.id,
    shipperId: trip.loadOrder?.shipperProfileId ?? null,
    transporterId: trip.truck.transporterId ?? null,
    vehicleId: trip.truckId,
    driverId: trip.driverId,
    route: `${trip.loadingLocation} → ${trip.destination}`,
    plateNumber: trip.truck.plateNumber,
    driverName: `${trip.driver.firstName} ${trip.driver.lastName}`.trim(),
    shipperName: trip.loadOrder?.shipperProfile.name ?? 'Unassigned shipper',
    customerName: trip.customerName ?? 'Unspecified customer',
  }]))
}

function factFromTrip(dim: TripDim, input: Omit<HaulageReportFact, 'shipperId' | 'transporterId' | 'vehicleId' | 'driverId' | 'route'>): HaulageReportFact {
  return { ...input, shipperId: dim.shipperId, transporterId: dim.transporterId, vehicleId: dim.vehicleId, driverId: dim.driverId, route: dim.route }
}

async function tripFacts(family: Extract<HaulageReportFamily, 'trip_operations' | 'utilization' | 'route' | 'shipper_customer' | 'revenue_cost_margin'>, filters: HaulageReportFilters) {
  const trips = await db.trip.findMany({
    where: { ...(dateWhere(filters) ? { departureTime: dateWhere(filters) } : {}) },
    select: {
      id: true, tripNumber: true, status: true, departureTime: true, arrivalTime: true,
      loadingLocation: true, destination: true, quantity: true, unit: true, totalMileage: true,
      actualDuration: true, fuelUsed: true, totalRevenue: true, customerName: true,
      truckId: true, driverId: true,
      truck: { select: { plateNumber: true, transporterId: true } },
      driver: { select: { firstName: true, lastName: true } },
      loadOrder: { select: { shipperProfileId: true, shipperProfile: { select: { name: true } } } },
    },
    orderBy: { departureTime: 'desc' }, take: MAX_ROWS,
  })

  const reconRows = family === 'revenue_cost_margin' && trips.length
    ? await db.tripReconciliation.findMany({
        where: { tripId: { in: trips.map((trip) => trip.id) } },
        select: { tripId: true, version: true, operationalCost: true },
        orderBy: [{ tripId: 'asc' }, { version: 'desc' }],
      })
    : []
  const costByTrip = new Map<string, number>()
  for (const row of reconRows) if (!costByTrip.has(row.tripId)) costByTrip.set(row.tripId, n(row.operationalCost))

  return trips.map<HaulageReportFact>((trip) => {
    const dim: TripDim = {
      id: trip.id,
      shipperId: trip.loadOrder?.shipperProfileId ?? null,
      transporterId: trip.truck.transporterId ?? null,
      vehicleId: trip.truckId,
      driverId: trip.driverId,
      route: `${trip.loadingLocation} → ${trip.destination}`,
      plateNumber: trip.truck.plateNumber,
      driverName: `${trip.driver.firstName} ${trip.driver.lastName}`.trim(),
      shipperName: trip.loadOrder?.shipperProfile.name ?? 'Unassigned shipper',
      customerName: trip.customerName ?? 'Unspecified customer',
    }
    const common = {
      tripNumber: trip.tripNumber,
      truck: dim.plateNumber,
      driver: dim.driverName,
      route: dim.route,
      status: trip.status,
    }
    let values: Record<string, string | number | boolean | null | undefined>
    if (family === 'trip_operations') values = { ...common, shipper: dim.shipperName, customer: dim.customerName, quantity: trip.quantity, unit: trip.unit, tonnage: tonneQuantity(trip.quantity, trip.unit), distanceKm: trip.totalMileage ?? 0 }
    else if (family === 'utilization') values = { truck: dim.plateNumber, tripNumber: trip.tripNumber, status: trip.status, trips: 1, distanceKm: trip.totalMileage ?? 0, activeHours: trip.actualDuration ?? 0 }
    else if (family === 'route') values = { route: dim.route, tripNumber: trip.tripNumber, trips: 1, distanceKm: trip.totalMileage ?? 0, tonnage: tonneQuantity(trip.quantity, trip.unit), durationHours: trip.actualDuration ?? 0 }
    else if (family === 'shipper_customer') values = { shipper: dim.shipperName, customer: dim.customerName, tripNumber: trip.tripNumber, route: dim.route, trips: 1, quantity: trip.quantity, unit: trip.unit, revenue: n(trip.totalRevenue) }
    else {
      const revenue = n(trip.totalRevenue)
      const cost = costByTrip.get(trip.id) ?? 0
      values = { ...common, revenue, cost, margin: revenue - cost }
    }
    return factFromTrip(dim, { id: trip.id, family, occurredAt: trip.departureTime, values })
  })
}

async function loadingWaitFacts(filters: HaulageReportFilters) {
  const rows = await db.factoryQueueEntry.findMany({
    where: { ...(dateWhere(filters) ? { joinedAt: dateWhere(filters) } : {}) }, orderBy: { joinedAt: 'desc' }, take: MAX_ROWS,
  })
  const dims = await tripDimensions(rows.flatMap((row) => row.tripId ? [row.tripId] : []))
  return rows.map<HaulageReportFact>((row) => {
    const dim = row.tripId ? dims.get(row.tripId) : undefined
    const wait = row.actualWait ?? Math.max(0, Math.round(((row.completedAt ?? new Date()).getTime() - row.joinedAt.getTime()) / 60000))
    const base = { id: row.id, family: 'loading_wait' as const, occurredAt: row.joinedAt, values: { site: row.siteName, queueType: row.queueType, status: row.status, waitMinutes: wait, detentionMinutes: row.detentionMinutes, bay: row.bayId ?? '' } }
    return dim ? factFromTrip(dim, base) : { ...base, vehicleId: row.truckId, driverId: row.driverId }
  })
}

async function safetyFacts(filters: HaulageReportFilters) {
  const rows = await db.vehicleInspection.findMany({
    where: { ...(dateWhere(filters) ? { inspectionDate: dateWhere(filters) } : {}) },
    select: { id: true, inspectionDate: true, type: true, result: true, warningCount: true, failCount: true, defectsFound: true, truckId: true, driverId: true, tripId: true, truck: { select: { plateNumber: true, transporterId: true } }, driver: { select: { firstName: true, lastName: true } } },
    orderBy: { inspectionDate: 'desc' }, take: MAX_ROWS,
  })
  const dims = await tripDimensions(rows.flatMap((row) => row.tripId ? [row.tripId] : []))
  return rows.map<HaulageReportFact>((row) => {
    const dim = row.tripId ? dims.get(row.tripId) : undefined
    const base = { id: row.id, family: 'driver_safety' as const, occurredAt: row.inspectionDate, values: { truck: row.truck.plateNumber, driver: row.driver ? `${row.driver.firstName} ${row.driver.lastName}` : '', inspectionType: row.type, result: row.result, warnings: row.warningCount, failures: row.failCount, defectsFound: row.defectsFound } }
    return dim ? factFromTrip(dim, base) : { ...base, transporterId: row.truck.transporterId, vehicleId: row.truckId, driverId: row.driverId }
  })
}

async function fuelFacts(filters: HaulageReportFilters) {
  const rows = await db.fuelLog.findMany({
    where: { ...(dateWhere(filters) ? { date: dateWhere(filters) } : {}) },
    select: { id: true, tripId: true, truckId: true, date: true, litersFilled: true, totalCost: true, distanceCovered: true, stationName: true, fuelType: true },
    orderBy: { date: 'desc' }, take: MAX_ROWS,
  })
  const dims = await tripDimensions(rows.map((row) => row.tripId))
  return rows.map<HaulageReportFact>((row) => {
    const dim = dims.get(row.tripId)
    const base = { id: row.id, family: 'fuel' as const, occurredAt: row.date, values: { station: row.stationName ?? '', fuelType: row.fuelType, litres: row.litersFilled, distanceKm: row.distanceCovered ?? 0, fuelCost: n(row.totalCost) } }
    return dim ? factFromTrip(dim, base) : { ...base, vehicleId: row.truckId }
  })
}

async function maintenanceFacts(filters: HaulageReportFilters) {
  const rows = await db.maintenanceRecord.findMany({
    where: { ...(dateWhere(filters) ? { performedAt: dateWhere(filters) } : {}) },
    select: { id: true, truckId: true, type: true, title: true, performedAt: true, status: true, odometer: true, cost: true, truck: { select: { plateNumber: true, transporterId: true } } },
    orderBy: { performedAt: 'desc' }, take: MAX_ROWS,
  })
  return rows.map<HaulageReportFact>((row) => ({ id: row.id, family: 'maintenance', occurredAt: row.performedAt, transporterId: row.truck.transporterId, vehicleId: row.truckId, values: { truck: row.truck.plateNumber, type: row.type, maintenance: row.title, status: row.status, odometerKm: row.odometer ?? 0, maintenanceCost: n(row.cost) } }))
}

async function complianceFacts(filters: HaulageReportFilters) {
  const [roadworthy, dvla, insurance] = await Promise.all([
    db.roadworthyInspection.findMany({ where: { ...(dateWhere(filters) ? { inspectionDate: dateWhere(filters) } : {}) }, select: { id: true, truckId: true, inspectionDate: true, certificateNumber: true, certificateExpiry: true, result: true, truck: { select: { plateNumber: true, transporterId: true } } }, take: MAX_ROWS }),
    db.dvlaRegistration.findMany({ where: { ...(dateWhere(filters) ? { registrationDate: dateWhere(filters) } : {}) }, select: { id: true, truckId: true, registrationDate: true, expiryDate: true, registrationNumber: true, status: true, truck: { select: { plateNumber: true, transporterId: true } } }, take: MAX_ROWS }),
    db.insurance.findMany({ where: { ...(dateWhere(filters) ? { startDate: dateWhere(filters) } : {}) }, select: { id: true, truckId: true, startDate: true, endDate: true, policyNumber: true, status: true, provider: true, truck: { select: { plateNumber: true, transporterId: true } } }, take: MAX_ROWS }),
  ])
  return [
    ...roadworthy.map<HaulageReportFact>((row) => ({ id: `rw:${row.id}`, family: 'compliance', occurredAt: row.inspectionDate, transporterId: row.truck.transporterId, vehicleId: row.truckId, values: { truck: row.truck.plateNumber, document: 'Roadworthy', reference: row.certificateNumber, status: row.result, expiresAt: row.certificateExpiry?.toISOString() ?? '' } })),
    ...dvla.map<HaulageReportFact>((row) => ({ id: `dvla:${row.id}`, family: 'compliance', occurredAt: row.registrationDate, transporterId: row.truck.transporterId, vehicleId: row.truckId, values: { truck: row.truck.plateNumber, document: 'DVLA Registration', reference: row.registrationNumber, status: row.status, expiresAt: row.expiryDate.toISOString() } })),
    ...insurance.map<HaulageReportFact>((row) => ({ id: `ins:${row.id}`, family: 'compliance', occurredAt: row.startDate, transporterId: row.truck.transporterId, vehicleId: row.truckId, values: { truck: row.truck.plateNumber, document: `Insurance · ${row.provider}`, reference: row.policyNumber, status: row.status, expiresAt: row.endDate.toISOString() } })),
  ]
}

async function weightFacts(filters: HaulageReportFilters) {
  const rows = await db.weighingEvent.findMany({
    where: { ...(dateWhere(filters) ? { recordedAt: dateWhere(filters) } : {}) }, include: { axleReadings: true }, orderBy: { recordedAt: 'desc' }, take: MAX_ROWS,
  })
  const dims = await tripDimensions(rows.map((row) => row.tripId))
  return rows.map<HaulageReportFact>((row) => {
    const dim = dims.get(row.tripId)
    const base = { id: row.id, family: 'weight_overload' as const, occurredAt: row.recordedAt, values: { stage: row.stage, grossWeightKg: row.grossWeightKg ?? 0, tareWeightKg: row.tareWeightKg ?? 0, netWeightKg: row.netWeightKg ?? 0, variancePercent: row.variancePercent ?? 0, axleCount: row.axleReadings.length, exceededAxles: row.axleReadings.filter((axle) => axle.exceeded).length, clearancePassed: row.clearancePassed ?? false, ticketNumber: row.ticketNumber ?? '' } }
    return dim ? factFromTrip(dim, base) : { ...base, vehicleId: row.tractorId, driverId: row.driverId }
  })
}

async function podExceptionFacts(filters: HaulageReportFilters) {
  const rows = await db.deliveryException.findMany({ where: { ...(dateWhere(filters) ? { createdAt: dateWhere(filters) } : {}) }, orderBy: { createdAt: 'desc' }, take: MAX_ROWS })
  const dims = await tripDimensions(rows.map((row) => row.tripId))
  return rows.map<HaulageReportFact>((row) => {
    const dim = dims.get(row.tripId)
    const base = { id: row.id, family: 'pod_exceptions' as const, occurredAt: row.createdAt, values: { exceptionType: row.type, status: row.status, quantity: row.quantity ?? 0, notes: row.notes ?? '', resolvedAt: row.resolvedAt?.toISOString() ?? '' } }
    return dim ? factFromTrip(dim, base) : base
  })
}

async function haulierSettlementFacts(filters: HaulageReportFilters) {
  const rows = await db.haulierSettlement.findMany({ where: { ...(dateWhere(filters) ? { createdAt: dateWhere(filters) } : {}) }, orderBy: { createdAt: 'desc' }, take: MAX_ROWS })
  const dims = await tripDimensions(rows.map((row) => row.tripId))
  return rows.map<HaulageReportFact>((row) => {
    const dim = dims.get(row.tripId)
    const base = { id: row.id, family: 'haulier_settlement' as const, occurredAt: row.createdAt, values: { payee: row.payeeName, payeeType: row.payeeType, status: row.status, baseFreight: n(row.baseFreight), detentionAmount: n(row.detentionAmount), extrasAmount: n(row.extrasAmount), shortageDeduction: n(row.shortageDeduction), netPayable: n(row.netPayable), currency: row.currency } }
    return dim ? factFromTrip(dim, base) : base
  })
}

async function driverSettlementFacts(filters: HaulageReportFilters) {
  const rows = await db.driverSettlement.findMany({
    where: { ...(dateWhere(filters) ? { periodEnd: dateWhere(filters) } : {}) },
    select: { id: true, driverId: true, period: true, periodEnd: true, grossEarnings: true, fuelDeductions: true, expenseDeductions: true, bonusAmount: true, netPay: true, status: true, driver: { select: { firstName: true, lastName: true } } },
    orderBy: { periodEnd: 'desc' }, take: MAX_ROWS,
  })
  return rows.map<HaulageReportFact>((row) => ({ id: row.id, family: 'driver_settlement', occurredAt: row.periodEnd, driverId: row.driverId, values: { driver: `${row.driver.firstName} ${row.driver.lastName}`, period: row.period, status: row.status, grossEarnings: n(row.grossEarnings), fuelDeductions: n(row.fuelDeductions), expenseDeductions: n(row.expenseDeductions), bonusAmount: n(row.bonusAmount), netPay: n(row.netPay) } }))
}

async function deviceHealthFacts(filters: HaulageReportFilters) {
  const rows = await db.telematicsDevice.findMany({
    where: { ...(dateWhere(filters) ? { updatedAt: dateWhere(filters) } : {}) },
    include: { installations: { where: { uninstalledAt: null }, orderBy: { installedAt: 'desc' }, take: 1 } },
    orderBy: { updatedAt: 'desc' }, take: MAX_ROWS,
  })
  const truckIds = rows.flatMap((row) => row.installations[0]?.assetType === 'truck' ? [row.installations[0].assetId] : [])
  const trucks = truckIds.length ? await db.truck.findMany({ where: { id: { in: truckIds } }, select: { id: true, plateNumber: true, transporterId: true } }) : []
  const truckMap = new Map(trucks.map((truck) => [truck.id, truck]))
  const now = Date.now()
  return rows.map<HaulageReportFact>((row) => {
    const install = row.installations[0]
    const truck = install?.assetType === 'truck' ? truckMap.get(install.assetId) : undefined
    const latencyMinutes = row.lastSeenAt ? Math.max(0, Math.round((now - row.lastSeenAt.getTime()) / 60000)) : -1
    return { id: row.id, family: 'device_health', occurredAt: row.updatedAt, transporterId: truck?.transporterId, vehicleId: truck?.id, values: { device: row.name, provider: row.provider, deviceType: row.deviceType, status: row.status, asset: truck?.plateNumber ?? install?.assetId ?? '', lastSeenAt: row.lastSeenAt?.toISOString() ?? '', latencyMinutes } }
  })
}

export async function fetchHaulageReportFacts(family: HaulageReportFamily, filters: HaulageReportFilters): Promise<HaulageReportFact[]> {
  if (['trip_operations', 'utilization', 'route', 'shipper_customer', 'revenue_cost_margin'].includes(family)) return tripFacts(family as Extract<HaulageReportFamily, 'trip_operations' | 'utilization' | 'route' | 'shipper_customer' | 'revenue_cost_margin'>, filters)
  if (family === 'loading_wait') return loadingWaitFacts(filters)
  if (family === 'driver_safety') return safetyFacts(filters)
  if (family === 'fuel') return fuelFacts(filters)
  if (family === 'maintenance') return maintenanceFacts(filters)
  if (family === 'compliance') return complianceFacts(filters)
  if (family === 'weight_overload') return weightFacts(filters)
  if (family === 'pod_exceptions') return podExceptionFacts(filters)
  if (family === 'haulier_settlement') return haulierSettlementFacts(filters)
  if (family === 'driver_settlement') return driverSettlementFacts(filters)
  if (family === 'device_health') return deviceHealthFacts(filters)
  return []
}
