import { describe, expect, it } from 'vitest'
import { summarizeOperations } from '../summary'

const now = new Date('2026-10-10T10:00:00Z')

describe('summarizeOperations', () => {
  it('groups active trips by operational stage and excludes terminal trips', () => {
    const result = summarizeOperations({
      now,
      trips: [
        { id: 't1', status: 'loading' },
        { id: 't2', status: 'loading' },
        { id: 't3', status: 'in_transit' },
        { id: 't4', status: 'completed' },
        { id: 't5', status: 'cancelled' },
      ],
    })
    expect(result.activeTrips).toBe(3)
    expect(result.tripsByStage).toEqual({ loading: 2, in_transit: 1 })
  })

  it('counts overdue load orders by pickup window and unfinished status', () => {
    const result = summarizeOperations({
      now,
      loadOrders: [
        { id: 'a', status: 'open', pickupWindowEnd: '2026-10-10T09:00:00Z' },
        { id: 'b', status: 'partially_allocated', pickupWindowEnd: '2026-10-10T09:30:00Z' },
        { id: 'c', status: 'allocated', pickupWindowEnd: '2026-10-10T09:00:00Z' },
        { id: 'd', status: 'open', pickupWindowEnd: '2026-10-10T11:00:00Z' },
      ],
    })
    expect(result.overdueLoads).toBe(2)
  })

  it('calculates queue detention from elapsed wait and free minutes', () => {
    const result = summarizeOperations({
      now,
      queues: [
        { id: 'q1', status: 'waiting', joinedAt: '2026-10-10T08:00:00Z', detentionFreeMinutes: 60 },
        { id: 'q2', status: 'loading', joinedAt: '2026-10-10T09:30:00Z', detentionFreeMinutes: 60 },
        { id: 'q3', status: 'completed', joinedAt: '2026-10-10T07:00:00Z', detentionFreeMinutes: 30, completedAt: '2026-10-10T08:00:00Z' },
      ],
    })
    expect(result.activeQueue).toBe(2)
    expect(result.detentionCases).toBe(2)
    expect(result.maxDetentionMinutes).toBe(60)
  })

  it('counts open operational exceptions without leaking financial values', () => {
    const result = summarizeOperations({
      now,
      trackingAlerts: [{ id: 'a1', isRead: false }, { id: 'a2', isRead: true }],
      deliveryExceptions: [{ id: 'd1', status: 'open' }, { id: 'd2', status: 'resolved' }],
      reconciliationExceptions: [{ id: 'r1', status: 'open' }, { id: 'r2', status: 'resolved' }],
    })
    expect(result.unreadTrackingAlerts).toBe(1)
    expect(result.deliveryExceptions).toBe(1)
    expect(result.reconciliationBlockers).toBe(1)
    expect(result).not.toHaveProperty('revenue')
    expect(result).not.toHaveProperty('margin')
  })

  it('counts fleet availability by operational truck status', () => {
    const result = summarizeOperations({
      now,
      trucks: [
        { id: 'truck-1', status: 'active' },
        { id: 'truck-2', status: 'active' },
        { id: 'truck-3', status: 'inactive' },
        { id: 'truck-4', status: 'maintenance' },
        { id: 'truck-5', status: 'out_of_service' },
        { id: 'truck-6', status: 'retired' },
      ],
    })

    expect(result.activeTrucks).toBe(2)
    expect(result.inactiveTrucks).toBe(1)
    expect(result.maintenanceTrucks).toBe(1)
    expect(result.outOfServiceTrucks).toBe(1)
  })

  it('summarizes todays dispatched trips, native tonne quantity, outstanding POD and reconciliation queue', () => {
    const result = summarizeOperations({
      now,
      trips: [
        { id: 'today-tonnes', status: 'in_transit', departureTime: '2026-10-10T06:00:00Z', quantity: 28, unit: 'tonnes' },
        { id: 'today-bags', status: 'delivered', departureTime: '2026-10-10T07:00:00Z', quantity: 600, unit: 'bags' },
        { id: 'today-awaiting', status: 'awaiting_reconciliation', departureTime: '2026-10-10T08:00:00Z', quantity: 12.5, unit: 'tonne' },
        { id: 'yesterday', status: 'delivered', departureTime: '2026-10-09T23:30:00Z', quantity: 20, unit: 'tonnes' },
      ],
      proofOfDeliveries: [
        { id: 'pod-1', tripId: 'today-awaiting' },
      ],
    })

    expect(result.todaysTrips).toBe(3)
    expect(result.todaysTonnage).toBe(40.5)
    expect(result.outstandingPod).toBe(2)
    expect(result.awaitingReconciliation).toBe(1)
  })

})
