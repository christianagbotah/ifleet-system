import { db } from '@/lib/db'
import { deriveSettlementPaymentEffects } from './settlement-payment'

export class DriverSettlementPaymentError extends Error {
  constructor(public readonly code: 'SETTLEMENT_NOT_FOUND' | 'SETTLEMENT_NOT_APPROVED') {
    super(code)
  }
}

export async function markDriverSettlementPaid(settlementId: string, paidAt = new Date()) {
  return db.$transaction(async (tx) => {
    const settlement = await tx.driverSettlement.findUnique({
      where: { id: settlementId },
      include: { SettlementLine: true },
    })
    if (!settlement) throw new DriverSettlementPaymentError('SETTLEMENT_NOT_FOUND')
    if (settlement.status === 'paid') return settlement
    if (settlement.status !== 'approved') throw new DriverSettlementPaymentError('SETTLEMENT_NOT_APPROVED')

    const advanceIds = settlement.SettlementLine
      .filter((line) => line.type === 'advance_deduction' && line.sourceId)
      .map((line) => line.sourceId as string)

    const advances = advanceIds.length > 0
      ? await tx.cashAdvance.findMany({
          where: { id: { in: advanceIds }, driverId: settlement.driverId },
          select: { id: true, totalDeducted: true, remainingBalance: true },
        })
      : []

    const effects = deriveSettlementPaymentEffects({
      lines: settlement.SettlementLine.map((line) => ({
        type: line.type,
        sourceId: line.sourceId,
        amount: Number(line.amount),
      })),
      advances: advances.map((advance) => ({
        id: advance.id,
        totalDeducted: Number(advance.totalDeducted),
        remainingBalance: Number(advance.remainingBalance),
      })),
    })

    for (const update of effects.advanceUpdates) {
      await tx.cashAdvance.update({
        where: { id: update.id },
        data: {
          totalDeducted: update.totalDeducted,
          remainingBalance: update.remainingBalance,
          status: update.status,
        },
      })
    }

    if (effects.paidIncentiveIds.length > 0) {
      await tx.driverIncentive.updateMany({
        where: {
          id: { in: effects.paidIncentiveIds },
          driverId: settlement.driverId,
          status: 'approved',
        },
        data: { status: 'paid', paidAt },
      })
    }

    return tx.driverSettlement.update({
      where: { id: settlement.id },
      data: { status: 'paid', paidAt },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, employeeId: true, photo: true } },
        SettlementLine: true,
      },
    })
  }, { isolationLevel: 'Serializable' })
}
