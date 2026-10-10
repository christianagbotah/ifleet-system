import { db } from '@/lib/db'
import { evaluateAssignmentEligibility } from '@/lib/domain/dispatch/eligibility'
import { GHANA_CITIES } from '@/lib/ghana-routes'
import type { FuelEfficiencySample } from './advisory'

export type TelematicsFreshness = 'fresh' | 'stale' | 'unknown'

export interface RouteCandidateEvidence {
  tractorId: string
  plateNumber: string
  make: string
  model: string
  driverId: string | null
  driverName: string | null
  eligible: boolean
  blocking: string[]
  warnings: string[]
  deadheadKm: number | null
  location: {
    latitude: number | null
    longitude: number | null
    source: string
    trust: string | null
    receivedAt: Date | null
    freshness: TelematicsFreshness
  }
  fuelSamples: FuelEfficiencySample[]
  dataQualityScore: number
}

export interface FleetRouteEvidence {
  candidates: RouteCandidateEvidence[]
  fleetFuelSamples: FuelEfficiencySample[]
}

export interface LoadFleetEvidenceInput {
  origin: string
  now?: Date
  maxTractors?: number
}

const FRESH_WINDOW_MS = 15 * 60 * 1000
const HISTORY_WINDOW_MS = 365 * 24 * 60 * 60 * 1000

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}

function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const rad = (value: number) => value * Math.PI / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLon = rad(b.longitude - a.longitude)
  const lat1 = rad(a.latitude)
  const lat2 = rad(b.latitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function validFuelSample(distanceKm: number | null, fuelLiters: number | null): FuelEfficiencySample | null {
  if (distanceKm == null || fuelLiters == null) return null
  if (!Number.isFinite(distanceKm) || !Number.isFinite(fuelLiters) || distanceKm <= 0 || fuelLiters <= 0) return null
  return { distanceKm, fuelLiters }
}

function freshness(receivedAt: Date | null, now: Date): TelematicsFreshness {
  if (!receivedAt) return 'unknown'
  const age = Math.max(0, now.getTime() - receivedAt.getTime())
  return age <= FRESH_WINDOW_MS ? 'fresh' : 'stale'
}

function locationQuality(value: TelematicsFreshness, trust: string | null): number {
  const base = value === 'fresh' ? 0.92 : value === 'stale' ? 0.62 : 0.45
  const trustPenalty = trust && ['trusted', 'verified', 'high'].includes(trust.toLowerCase()) ? 0 : 0.05
  return clamp(base - trustPenalty)
}

export class PrismaRouteAdvisoryRepository {
  async loadFleetEvidence(input: LoadFleetEvidenceInput): Promise<FleetRouteEvidence> {
    const now = input.now ?? new Date()
    const historySince = new Date(now.getTime() - HISTORY_WINDOW_MS)
    const maxTractors = Math.min(Math.max(input.maxTractors ?? 50, 1), 100)

    const tractors = await db.truck.findMany({
      where: { status: 'active' },
      orderBy: { plateNumber: 'asc' },
      take: maxTractors,
      include: {
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            status: true,
            verificationStatus: true,
            licenseExpiry: true,
            licenseClass: true,
          },
        },
        Insurance: {
          orderBy: { endDate: 'desc' },
          take: 1,
          select: { status: true, endDate: true },
        },
        RoadworthyInspection: {
          orderBy: { inspectionDate: 'desc' },
          take: 1,
          select: {
            status: true,
            result: true,
            vehicleFitness: true,
            certificateIssued: true,
            certificateExpiry: true,
          },
        },
        MaintenanceRecord: {
          where: { status: { in: ['pending', 'in_progress'] } },
          take: 1,
          select: { id: true },
        },
      },
    })

    const tractorIds = tractors.map((tractor) => tractor.id)
    if (tractorIds.length === 0) return { candidates: [], fleetFuelSamples: [] }

    const [liveStates, activeTrips, history] = await Promise.all([
      db.vehicleLiveState.findMany({
        where: { assetType: 'tractor', assetId: { in: tractorIds } },
        select: {
          assetId: true,
          latitude: true,
          longitude: true,
          source: true,
          trust: true,
          receivedAt: true,
        },
      }),
      db.trip.findMany({
        where: {
          status: { notIn: ['completed', 'cancelled'] },
          OR: [
            { truckId: { in: tractorIds } },
            { driverId: { in: tractors.flatMap((tractor) => tractor.driver ? [tractor.driver.id] : []) } },
          ],
        },
        select: { truckId: true, driverId: true },
      }),
      db.trip.findMany({
        where: {
          status: 'completed',
          truckId: { in: tractorIds },
          arrivalTime: { gte: historySince },
        },
        select: { truckId: true, totalMileage: true, fuelUsed: true },
        take: 5000,
      }),
    ])

    const liveByTractor = new Map(liveStates.map((state) => [state.assetId, state]))
    const busyTractors = new Set(activeTrips.map((trip) => trip.truckId).filter(Boolean))
    const busyDrivers = new Set(activeTrips.map((trip) => trip.driverId).filter(Boolean))
    const origin = GHANA_CITIES.find((city) => city.name === input.origin) ?? null

    const historyByTractor = new Map<string, FuelEfficiencySample[]>()
    const fleetFuelSamples: FuelEfficiencySample[] = []
    for (const trip of history) {
      const sample = validFuelSample(trip.totalMileage, trip.fuelUsed)
      if (!sample) continue
      fleetFuelSamples.push(sample)
      const samples = historyByTractor.get(trip.truckId) ?? []
      samples.push(sample)
      historyByTractor.set(trip.truckId, samples)
    }

    const candidates: RouteCandidateEvidence[] = tractors.map((tractor) => {
      const driver = tractor.driver
      const blocking: string[] = []
      const warnings: string[] = []

      if (!driver) {
        blocking.push('driver_unassigned')
      } else {
        const insurance = tractor.Insurance[0] ?? null
        const roadworthy = tractor.RoadworthyInspection[0] ?? null
        const eligibility = evaluateAssignmentEligibility({
          now,
          driver: {
            id: driver.id,
            status: driver.status,
            verificationStatus: driver.verificationStatus,
            licenseExpiry: driver.licenseExpiry,
            licenseClass: driver.licenseClass,
          },
          tractor: { id: tractor.id, status: tractor.status },
          insurance: insurance ? { status: insurance.status, endDate: insurance.endDate } : null,
          roadworthy: roadworthy ? {
            status: roadworthy.status,
            result: roadworthy.result,
            vehicleFitness: roadworthy.vehicleFitness,
            certificateIssued: roadworthy.certificateIssued,
            certificateExpiry: roadworthy.certificateExpiry,
          } : null,
          maintenance: { blocking: tractor.MaintenanceRecord.length > 0 },
          trailer: null,
          requirements: {
            requiresTrailer: false,
            allowedLicenseClasses: [],
            allowedTrailerTypes: [],
            requiredDocuments: [],
          },
          documents: [],
        })
        blocking.push(...eligibility.blocking)
        warnings.push(...eligibility.warnings)
        if (busyDrivers.has(driver.id)) blocking.push('driver_active_trip')
      }

      if (busyTractors.has(tractor.id)) blocking.push('tractor_active_trip')

      const live = liveByTractor.get(tractor.id) ?? null
      const liveFreshness = freshness(live?.receivedAt ?? null, now)
      const hasCoordinates = live?.latitude != null && live.longitude != null
      const deadheadKm = origin && hasCoordinates
        ? haversineKm(
            { latitude: live!.latitude!, longitude: live!.longitude! },
            { latitude: origin.lat, longitude: origin.lng },
          )
        : null
      const quality = locationQuality(liveFreshness, live?.trust ?? null)

      return {
        tractorId: tractor.id,
        plateNumber: tractor.plateNumber,
        make: tractor.make,
        model: tractor.model,
        driverId: driver?.id ?? null,
        driverName: driver ? `${driver.firstName} ${driver.lastName}` : null,
        eligible: blocking.length === 0,
        blocking: [...new Set(blocking)],
        warnings: [...new Set(warnings)],
        deadheadKm,
        location: {
          latitude: hasCoordinates ? live!.latitude : null,
          longitude: hasCoordinates ? live!.longitude : null,
          source: hasCoordinates ? live!.source : 'unavailable',
          trust: live?.trust ?? null,
          receivedAt: live?.receivedAt ?? null,
          freshness: hasCoordinates ? liveFreshness : 'unknown',
        },
        fuelSamples: historyByTractor.get(tractor.id) ?? [],
        dataQualityScore: quality,
      }
    })

    return { candidates, fleetFuelSamples }
  }
}
