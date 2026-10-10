import { createHash } from 'node:crypto'

import { db } from '@/lib/db'

import { assessDataQuality } from './data-quality'
import { calculateRouteFuelBaseline } from './fuel-baseline'
import { assessFuelAnomaly, type FuelAnomalyAssessment } from './fuel-anomaly'
import type { DataQualityAssessment } from './types'

export interface FuelLogReviewAnalysis {
  fuelLogId: string
  assessment: FuelAnomalyAssessment
  dataQuality: DataQualityAssessment
  inputSnapshotRef: string
  evidence: Record<string, unknown>
}

function distanceForTrip(trip: { totalMileage: number | null; startMileage: number | null; endMileage: number | null }): number | null {
  if (trip.totalMileage != null && trip.totalMileage > 0) return trip.totalMileage
  if (trip.startMileage != null && trip.endMileage != null && trip.endMileage > trip.startMileage) {
    return trip.endMileage - trip.startMileage
  }
  return null
}

export async function analyzeFuelLogForReview(fuelLogId: string, now = new Date()): Promise<FuelLogReviewAnalysis | null> {
  const log = await db.fuelLog.findUnique({
    where: { id: fuelLogId },
    select: {
      id: true,
      date: true,
      litersFilled: true,
      odometer: true,
      receiptNumber: true,
      trip: {
        select: {
          id: true,
          loadingCityId: true,
          destinationCityId: true,
          loadingLocation: true,
          destination: true,
          totalMileage: true,
          startMileage: true,
          endMileage: true,
          fuelUsed: true,
        },
      },
      truck: { select: { id: true, plateNumber: true, tankCapacity: true } },
    },
  })
  if (!log) return null

  const routeWhere = log.trip.loadingCityId && log.trip.destinationCityId
    ? { loadingCityId: log.trip.loadingCityId, destinationCityId: log.trip.destinationCityId }
    : { loadingLocation: log.trip.loadingLocation, destination: log.trip.destination }

  const peers = await db.trip.findMany({
    where: {
      id: { not: log.trip.id },
      status: 'completed',
      ...routeWhere,
    },
    select: {
      id: true,
      fuelUsed: true,
      totalMileage: true,
      startMileage: true,
      endMileage: true,
    },
    orderBy: { arrivalTime: 'desc' },
    take: 30,
  })

  const baselineResult = calculateRouteFuelBaseline(peers)
  const baseline = baselineResult.litersPer100Km

  const dataQuality = assessDataQuality({
    asOf: now,
    fuel: {
      measuredLiters: log.litersFilled,
      observedAt: log.date,
      source: log.receiptNumber ? 'receipt' : 'manual',
    },
    manual: log.odometer == null ? undefined : { odometerKm: log.odometer },
  })

  const tripDistance = distanceForTrip(log.trip)
  const assessment = assessFuelAnomaly({
    purchaseLiters: log.litersFilled,
    tankCapacityLiters: log.truck.tankCapacity,
    actualFuelUsedLiters: log.trip.fuelUsed,
    distanceKm: tripDistance,
    routeBaselineLitersPer100Km: baseline,
    routeBaselineSampleCount: baselineResult.sampleCount,
    evidenceMode: log.receiptNumber ? 'mixed' : 'manual',
    dataQuality,
  })

  const evidence = {
    fuelLogId: log.id,
    tripId: log.trip.id,
    truckId: log.truck.id,
    plateNumber: log.truck.plateNumber,
    recordedAt: log.date.toISOString(),
    purchaseLiters: log.litersFilled,
    tripDistanceKm: tripDistance,
    routeBaselineSamples: baselineResult.sampleCount,
    routeBaselineLitersPer100Km: baseline,
    source: log.receiptNumber ? 'receipt' : 'manual',
  }
  const snapshot = JSON.stringify({
    evidence,
    dataQuality: { grade: dataQuality.grade, score: dataQuality.score, issues: dataQuality.issues },
    assessment,
  })

  return {
    fuelLogId: log.id,
    assessment,
    dataQuality,
    inputSnapshotRef: `sha256:${createHash('sha256').update(snapshot).digest('hex')}`,
    evidence,
  }
}
