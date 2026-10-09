export interface HaulierSettlementInput {
  tripId: string
  deliveredQuantity: number
  deliveredUnit: string
  detentionMinutes: number
  approvedExtras: { id: string; description: string; amount: number }[]
  shortageQuantity: number
  fuelAdjustmentAmount: number
  advanceAlreadyPaid: number
}

export interface HaulierRateCard {
  rateType: string
  rateAmount: number
  detentionFreeMinutes?: number
  detentionRatePerHour?: number
  shortageRatePerUnit?: number
  taxRatePercent?: number
  withholdingRatePercent?: number
}

export interface HaulierSettlementLine {
  type: 'base_freight' | 'detention' | 'extra' | 'shortage' | 'fuel_adjustment' | 'tax' | 'withholding' | 'advance'
  sourceId: string | null
  description: string
  amount: number
}

export interface HaulierSettlementCalculation {
  baseFreight: number
  detentionAmount: number
  extrasAmount: number
  shortageDeduction: number
  fuelAdjustment: number
  taxAmount: number
  withholdingAmount: number
  advanceDeduction: number
  netPayable: number
  lines: HaulierSettlementLine[]
}

export interface HaulierParty {
  id: string
  name: string
  isInternal: boolean
}

function money(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`)
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function nonNegative(value: number, label: string): number {
  const rounded = money(value, label)
  if (rounded < 0) throw new Error(`${label} must not be negative`)
  return rounded
}

function normalizeDeliveredUnit(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

function assertRateUnit(rateType: string, deliveredUnit: string): void {
  const unit = normalizeDeliveredUnit(deliveredUnit)
  if (['per_tonne', 'per_ton', 'tonne', 'ton'].includes(rateType)) {
    if (!['tonne', 'tonnes', 'ton', 'tons', 'metrictonne', 'metrictonnes'].includes(unit)) {
      throw new Error(`Delivered unit ${deliveredUnit || '(blank)'} is incompatible with tonne-based rate`)
    }
    return
  }
  if (['per_bag', 'bag'].includes(rateType)) {
    if (!['bag', 'bags'].includes(unit)) {
      throw new Error(`Delivered unit ${deliveredUnit || '(blank)'} is incompatible with bag-based rate`)
    }
    return
  }
  if (['per_pallet', 'pallet'].includes(rateType)) {
    if (!['pallet', 'pallets'].includes(unit)) {
      throw new Error(`Delivered unit ${deliveredUnit || '(blank)'} is incompatible with pallet-based rate`)
    }
  }
}

function calculateBaseFreight(input: HaulierSettlementInput, rateCard: HaulierRateCard): number {
  const rate = nonNegative(rateCard.rateAmount, 'Rate amount')
  const quantity = nonNegative(input.deliveredQuantity, 'Delivered quantity')
  const rateType = rateCard.rateType.trim().toLowerCase()

  if (['per_trip', 'flat', 'trip'].includes(rateType)) return rate
  assertRateUnit(rateType, input.deliveredUnit)
  if (['per_tonne', 'per_ton', 'tonne', 'ton'].includes(rateType)) return money(quantity * rate, 'Base freight')
  if (['per_bag', 'bag', 'per_pallet', 'pallet', 'per_unit', 'unit'].includes(rateType)) {
    return money(quantity * rate, 'Base freight')
  }
  throw new Error(`Unsupported haulier rate type: ${rateCard.rateType}`)
}

export function calculateHaulierSettlement(input: HaulierSettlementInput, rateCard: HaulierRateCard): HaulierSettlementCalculation {
  const baseFreight = calculateBaseFreight(input, rateCard)
  const detentionMinutes = nonNegative(input.detentionMinutes, 'Detention minutes')
  const freeMinutes = nonNegative(rateCard.detentionFreeMinutes ?? 0, 'Detention free minutes')
  const detentionRate = nonNegative(rateCard.detentionRatePerHour ?? 0, 'Detention hourly rate')
  const billableDetentionMinutes = Math.max(0, detentionMinutes - freeMinutes)
  const detentionAmount = money((billableDetentionMinutes / 60) * detentionRate, 'Detention amount')

  const extrasAmount = money(input.approvedExtras.reduce((sum, extra) => {
    return sum + nonNegative(extra.amount, `Extra ${extra.id}`)
  }, 0), 'Approved extras')

  const shortageQuantity = nonNegative(input.shortageQuantity, 'Shortage quantity')
  const shortageRate = nonNegative(rateCard.shortageRatePerUnit ?? 0, 'Shortage rate')
  const shortageDeduction = money(shortageQuantity * shortageRate, 'Shortage deduction')
  const fuelAdjustment = money(input.fuelAdjustmentAmount, 'Fuel adjustment')

  const commercialSubtotal = Math.max(0, money(
    baseFreight + detentionAmount + extrasAmount - shortageDeduction + fuelAdjustment,
    'Commercial subtotal',
  ))
  const taxRate = nonNegative(rateCard.taxRatePercent ?? 0, 'Tax rate')
  const withholdingRate = nonNegative(rateCard.withholdingRatePercent ?? 0, 'Withholding rate')
  const taxAmount = money(commercialSubtotal * taxRate / 100, 'Tax amount')
  const withholdingAmount = money(commercialSubtotal * withholdingRate / 100, 'Withholding amount')
  const grossAfterTax = Math.max(0, money(commercialSubtotal + taxAmount - withholdingAmount, 'Gross after tax'))
  const requestedAdvance = nonNegative(input.advanceAlreadyPaid, 'Advance already paid')
  const advanceDeduction = Math.min(grossAfterTax, requestedAdvance)
  const netPayable = Math.max(0, money(grossAfterTax - advanceDeduction, 'Net payable'))

  const lines: HaulierSettlementLine[] = [
    { type: 'base_freight', sourceId: input.tripId, description: 'Contract freight', amount: baseFreight },
  ]
  if (detentionAmount > 0) lines.push({ type: 'detention', sourceId: input.tripId, description: 'Billable detention', amount: detentionAmount })
  for (const extra of input.approvedExtras) {
    const amount = nonNegative(extra.amount, `Extra ${extra.id}`)
    if (amount > 0) lines.push({ type: 'extra', sourceId: extra.id, description: extra.description, amount })
  }
  if (shortageDeduction > 0) lines.push({ type: 'shortage', sourceId: input.tripId, description: 'Shortage deduction', amount: -shortageDeduction })
  if (fuelAdjustment !== 0) lines.push({ type: 'fuel_adjustment', sourceId: input.tripId, description: 'Fuel adjustment', amount: fuelAdjustment })
  if (taxAmount > 0) lines.push({ type: 'tax', sourceId: null, description: 'Tax', amount: taxAmount })
  if (withholdingAmount > 0) lines.push({ type: 'withholding', sourceId: null, description: 'Withholding tax', amount: -withholdingAmount })
  if (advanceDeduction > 0) lines.push({ type: 'advance', sourceId: input.tripId, description: 'Advance already paid', amount: -advanceDeduction })

  return {
    baseFreight,
    detentionAmount,
    extrasAmount,
    shortageDeduction,
    fuelAdjustment,
    taxAmount,
    withholdingAmount,
    advanceDeduction,
    netPayable,
    lines,
  }
}

export function selectHaulierPayee(input: {
  rateCardTransporterId?: string | null
  transporter?: HaulierParty | null
  vehicleOwner?: HaulierParty | null
}): { type: 'transporter' | 'vehicle_owner'; id: string; name: string } | null {
  if (input.rateCardTransporterId && input.transporter?.id === input.rateCardTransporterId && !input.transporter.isInternal) {
    return { type: 'transporter', id: input.transporter.id, name: input.transporter.name }
  }
  if (input.vehicleOwner && !input.vehicleOwner.isInternal) {
    return { type: 'vehicle_owner', id: input.vehicleOwner.id, name: input.vehicleOwner.name }
  }
  if (input.transporter && !input.transporter.isInternal) {
    return { type: 'transporter', id: input.transporter.id, name: input.transporter.name }
  }
  return null
}
