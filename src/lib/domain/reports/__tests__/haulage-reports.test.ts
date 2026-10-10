import { describe, expect, it } from 'vitest'

import {
  HAULAGE_REPORT_FAMILIES,
  buildHaulageReport,
  toHaulageExportTable,
  type HaulageReportFact,
} from '@/lib/domain/reports/haulage-reports'

const facts: HaulageReportFact[] = [
  {
    id: 'row-1', family: 'trip_operations', occurredAt: '2026-10-02T10:00:00Z',
    shipperId: 'shipper-1', transporterId: 'transporter-1', vehicleId: 'truck-1', driverId: 'driver-1', route: 'Tema → Kumasi',
    values: { tripNumber: 'TRP-1', trips: 1, tonnage: 28, revenue: 12000, cost: 8000, margin: 4000 },
  },
  {
    id: 'row-2', family: 'trip_operations', occurredAt: '2026-10-04T10:00:00Z',
    shipperId: 'shipper-2', transporterId: 'transporter-2', vehicleId: 'truck-2', driverId: 'driver-2', route: 'Tema → Tamale',
    values: { tripNumber: 'TRP-2', trips: 1, tonnage: 34, revenue: 18000, cost: 11000, margin: 7000 },
  },
  {
    id: 'row-3', family: 'device_health', occurredAt: '2026-10-04T11:00:00Z',
    transporterId: 'transporter-1', vehicleId: 'truck-1',
    values: { device: 'GPS-1', health: 'online', latencyMinutes: 2 },
  },
]

describe('Ghana haulage report domain', () => {
  it('defines every approved report family', () => {
    expect(HAULAGE_REPORT_FAMILIES).toEqual(expect.arrayContaining([
      'trip_operations', 'utilization', 'route', 'shipper_customer', 'loading_wait',
      'driver_safety', 'fuel', 'maintenance', 'compliance', 'weight_overload',
      'pod_exceptions', 'revenue_cost_margin', 'haulier_settlement', 'driver_settlement',
      'device_health',
    ]))
    expect(HAULAGE_REPORT_FAMILIES).toHaveLength(15)
  })

  it('applies date, shipper, transporter, vehicle, driver and route filters together', () => {
    const result = buildHaulageReport({
      family: 'trip_operations', facts,
      filters: {
        dateFrom: '2026-10-01', dateTo: '2026-10-03', shipperId: 'shipper-1',
        transporterId: 'transporter-1', vehicleId: 'truck-1', driverId: 'driver-1', route: 'tema → kumasi',
      },
      canViewFinancials: true,
    })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.tripNumber).toBe('TRP-1')
  })

  it('redacts finance fields for users without financial access', () => {
    const result = buildHaulageReport({ family: 'trip_operations', facts, filters: {}, canViewFinancials: false })
    expect(result.columns).not.toEqual(expect.arrayContaining(['revenue', 'cost', 'margin']))
    expect(result.rows[0]).not.toHaveProperty('revenue')
    expect(result.rows[0]).not.toHaveProperty('cost')
    expect(result.rows[0]).not.toHaveProperty('margin')
    expect(result.totals).not.toHaveProperty('revenue')
  })

  it('keeps screen rows and export rows/totals identical', () => {
    const result = buildHaulageReport({ family: 'trip_operations', facts, filters: {}, canViewFinancials: true })
    const exported = toHaulageExportTable(result)
    expect(exported.rows).toEqual(result.rows.map((row) => result.columns.map((column) => row[column] ?? null)))
    expect(exported.totals).toEqual(result.totals)
  })

  it('does not mix report families', () => {
    const result = buildHaulageReport({ family: 'device_health', facts, filters: {}, canViewFinancials: true })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.device).toBe('GPS-1')
  })
})
