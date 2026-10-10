import { createHash } from 'node:crypto'

import {
  validateLoadOrder,
  type ExistingLoadOrderReference,
  type LoadOrderDraft,
  type LoadOrderDestinationDraft,
  type LoadOrderLineDraft,
} from '@/lib/domain/orders/load-order'

export type ExternalRow = Record<string, unknown>

export interface LoadOrderImportMapping {
  defaults: {
    shipperProfileId: string
    loadingPointId: string
    currency?: string
    priority?: string
  }
  columns?: Partial<Record<
    | 'externalReference'
    | 'destinationRef'
    | 'destinationName'
    | 'destinationAddress'
    | 'destinationZoneId'
    | 'clientId'
    | 'lineRef'
    | 'itemName'
    | 'externalProductCode'
    | 'quantity'
    | 'unit'
    | 'pickupWindowStart'
    | 'pickupWindowEnd'
    | 'deliveryWindowStart'
    | 'deliveryWindowEnd'
    | 'requiredVehicleType'
    | 'requiredTrailerType'
    | 'offeredRate'
    | 'priority'
    | 'specialHandling',
    string
  >>
  unitMap?: Record<string, string>
}

export interface ImportRowError {
  row: number
  externalReference: string | null
  blocking: string[]
}

export interface ImportResult {
  batchId: string
  acceptedCount: number
  rejectedRowCount: number
  created: Array<{ id: string; externalReference: string | null }>
  rowErrors: ImportRowError[]
}

interface ImportOptions {
  rows: ExternalRow[]
  mapping: LoadOrderImportMapping
  existingOrders?: ExistingLoadOrderReference[]
  persist: (draft: LoadOrderDraft) => Promise<{ id: string }>
}

const DEFAULT_COLUMNS: Required<NonNullable<LoadOrderImportMapping['columns']>> = {
  externalReference: 'externalReference',
  destinationRef: 'destinationRef',
  destinationName: 'destinationName',
  destinationAddress: 'destinationAddress',
  destinationZoneId: 'destinationZoneId',
  clientId: 'clientId',
  lineRef: 'lineRef',
  itemName: 'itemName',
  externalProductCode: 'externalProductCode',
  quantity: 'quantity',
  unit: 'unit',
  pickupWindowStart: 'pickupWindowStart',
  pickupWindowEnd: 'pickupWindowEnd',
  deliveryWindowStart: 'deliveryWindowStart',
  deliveryWindowEnd: 'deliveryWindowEnd',
  requiredVehicleType: 'requiredVehicleType',
  requiredTrailerType: 'requiredTrailerType',
  offeredRate: 'offeredRate',
  priority: 'priority',
  specialHandling: 'specialHandling',
}

function text(value: unknown): string | null {
  if (value == null) return null
  const result = String(value).trim()
  return result || null
}

function numeric(value: unknown): number {
  if (typeof value === 'number') return value
  const normalized = text(value)?.replace(/,/g, '') ?? ''
  return normalized ? Number(normalized) : Number.NaN
}

function columnValue(row: ExternalRow, mapping: LoadOrderImportMapping, key: keyof typeof DEFAULT_COLUMNS): unknown {
  const column = mapping.columns?.[key] ?? DEFAULT_COLUMNS[key]
  return row[column]
}

function normalizeUnit(value: unknown, unitMap?: Record<string, string>): string {
  const raw = text(value) ?? ''
  if (!unitMap) return raw
  const exact = unitMap[raw]
  if (exact) return exact
  const comparable = raw.toLowerCase()
  const matched = Object.entries(unitMap).find(([key]) => key.toLowerCase() === comparable)
  return matched?.[1] ?? raw
}

function defaultDestinationRef(name: string | null, rowNumber: number): string {
  if (!name) return `stop-${rowNumber}`
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return slug || `stop-${rowNumber}`
}

export function normalizeExternalLoadOrder(
  row: ExternalRow,
  mapping: LoadOrderImportMapping,
  rowNumber: number,
): LoadOrderDraft {
  const destinationName = text(columnValue(row, mapping, 'destinationName')) ?? ''
  const destinationRef = text(columnValue(row, mapping, 'destinationRef')) ?? defaultDestinationRef(destinationName, rowNumber)
  const lineRef = text(columnValue(row, mapping, 'lineRef')) ?? `line-${rowNumber}`
  const priority = text(columnValue(row, mapping, 'priority')) ?? mapping.defaults.priority ?? 'normal'
  const offeredRateValue = columnValue(row, mapping, 'offeredRate')
  const offeredRate = offeredRateValue == null || text(offeredRateValue) == null ? null : numeric(offeredRateValue)

  return {
    shipperProfileId: mapping.defaults.shipperProfileId.trim(),
    loadingPointId: mapping.defaults.loadingPointId.trim(),
    clientId: text(columnValue(row, mapping, 'clientId')),
    externalReference: text(columnValue(row, mapping, 'externalReference')),
    pickupWindowStart: text(columnValue(row, mapping, 'pickupWindowStart')),
    pickupWindowEnd: text(columnValue(row, mapping, 'pickupWindowEnd')),
    deliveryWindowStart: text(columnValue(row, mapping, 'deliveryWindowStart')),
    deliveryWindowEnd: text(columnValue(row, mapping, 'deliveryWindowEnd')),
    requiredVehicleType: text(columnValue(row, mapping, 'requiredVehicleType')),
    requiredTrailerType: text(columnValue(row, mapping, 'requiredTrailerType')),
    offeredRate,
    currency: mapping.defaults.currency?.trim() || 'GHS',
    priority,
    specialHandling: text(columnValue(row, mapping, 'specialHandling')),
    destinations: [{
      ref: destinationRef,
      name: destinationName,
      clientId: text(columnValue(row, mapping, 'clientId')),
      destinationZoneId: text(columnValue(row, mapping, 'destinationZoneId')),
      address: text(columnValue(row, mapping, 'destinationAddress')),
      deliveryWindowStart: text(columnValue(row, mapping, 'deliveryWindowStart')),
      deliveryWindowEnd: text(columnValue(row, mapping, 'deliveryWindowEnd')),
    }],
    lines: [{
      ref: lineRef,
      itemName: text(columnValue(row, mapping, 'itemName')) ?? '',
      externalProductCode: text(columnValue(row, mapping, 'externalProductCode')),
      quantity: numeric(columnValue(row, mapping, 'quantity')),
      unit: normalizeUnit(columnValue(row, mapping, 'unit'), mapping.unitMap),
      destinationRef,
    }],
  }
}

export function deriveLoadOrderImportBatchId(rows: ExternalRow[], mapping: LoadOrderImportMapping): string {
  return `IMP-${createHash('sha256').update(JSON.stringify({ rows, mapping })).digest('hex').slice(0, 20).toUpperCase()}`
}

function groupKey(draft: LoadOrderDraft, row: number): string {
  return draft.externalReference
    ? `${draft.shipperProfileId}\0${draft.externalReference.trim().toLowerCase()}`
    : `${draft.shipperProfileId}\0__row_${row}`
}

function mergeUniqueDestinations(target: LoadOrderDestinationDraft[], incoming: LoadOrderDestinationDraft[]) {
  for (const destination of incoming) {
    const existing = target.find((candidate) => candidate.ref === destination.ref)
    if (!existing) target.push(destination)
  }
}

function mergeLines(target: LoadOrderLineDraft[], incoming: LoadOrderLineDraft[]) {
  for (const line of incoming) target.push(line)
}

export async function importLoadOrders(options: ImportOptions): Promise<ImportResult> {
  const grouped = new Map<string, { draft: LoadOrderDraft; rows: number[] }>()
  const rowErrors: ImportRowError[] = []

  options.rows.forEach((row, index) => {
    const rowNumber = index + 1
    const draft = normalizeExternalLoadOrder(row, options.mapping, rowNumber)
    const key = groupKey(draft, rowNumber)
    const group = grouped.get(key)
    if (!group) {
      grouped.set(key, { draft, rows: [rowNumber] })
      return
    }
    mergeUniqueDestinations(group.draft.destinations, draft.destinations)
    mergeLines(group.draft.lines, draft.lines)
    group.rows.push(rowNumber)
  })

  const seen: ExistingLoadOrderReference[] = [...(options.existingOrders ?? [])]
  const created: Array<{ id: string; externalReference: string | null }> = []

  for (const group of grouped.values()) {
    const validation = validateLoadOrder(group.draft, seen)
    if (!validation.valid || !validation.normalized) {
      for (const row of group.rows) {
        rowErrors.push({ row, externalReference: group.draft.externalReference ?? null, blocking: validation.blocking })
      }
      continue
    }

    try {
      const persisted = await options.persist(validation.normalized)
      created.push({ id: persisted.id, externalReference: validation.normalized.externalReference ?? null })
      if (validation.normalized.externalReference) {
        seen.push({ shipperProfileId: validation.normalized.shipperProfileId, externalReference: validation.normalized.externalReference })
      }
    } catch {
      for (const row of group.rows) {
        rowErrors.push({ row, externalReference: validation.normalized.externalReference ?? null, blocking: ['persistence_failed'] })
      }
    }
  }

  return {
    batchId: deriveLoadOrderImportBatchId(options.rows, options.mapping),
    acceptedCount: created.length,
    rejectedRowCount: rowErrors.length,
    created,
    rowErrors,
  }
}
