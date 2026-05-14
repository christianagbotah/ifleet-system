import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireRole, ROLES } from '@/lib/auth-server'
import { verifyPayment } from '@/lib/services/paystack'
import { db } from '@/lib/db'
import { createAuditLog, getClientIp } from '@/lib/audit'

/**
 * Process a verified payment — update linked entities.
 * Shared logic used by both verify and webhook endpoints.
 */
async function processSuccessfulPayment(
  paymentData: {
    reference: string
    amount: number
    status: string
    channel: string
    customer: { email: string; first_name?: string; last_name?: string; phone?: string }
    metadata?: Record<string, unknown>
    paid_at?: string
    gateway_response?: string
  }
) {
  const { reference, amount, channel, customer, metadata } = paymentData
  const invoiceId = metadata?.invoiceId as string | undefined
  const settlementId = metadata?.settlementId as string | undefined
  const initiatedBy = metadata?.initiatedBy as string | undefined
  const amountGHS = amount / 100 // Convert from kobo/gpesewas back to GHS

  // Update invoice if linked
  if (invoiceId) {
    try {
      const invoice = await db.invoice.findUnique({ where: { id: invoiceId } })
      if (invoice) {
        const newPaidAmount = invoice.paidAmount + amountGHS
        await db.invoice.update({
          where: { id: invoiceId },
          data: {
            paidAmount: Math.min(newPaidAmount, invoice.totalAmount),
            status: newPaidAmount >= invoice.totalAmount ? 'paid' : 'sent',
          },
        })
      }
    } catch (err) {
      console.error('[PAYSTACK] Failed to update invoice:', invoiceId, err)
    }
  }

  // Update driver settlement if linked
  if (settlementId) {
    try {
      const settlement = await db.driverSettlement.findUnique({ where: { id: settlementId } })
      if (settlement && settlement.status !== 'paid') {
        await db.driverSettlement.update({
          where: { id: settlementId },
          data: {
            status: 'paid',
            paidAt: new Date(),
          },
        })
      }
    } catch (err) {
      console.error('[PAYSTACK] Failed to update settlement:', settlementId, err)
    }
  }

  // Create an Expense record for the payment
  try {
    // Use initiatedBy to find truckId if possible — otherwise use a system truck placeholder
    // Expense requires a truckId, so we'll try to find the first truck as fallback
    let truckId = metadata?.truckId as string | undefined

    if (!truckId) {
      // Try to find a truck from the invoice's trip
      if (invoiceId) {
        const invoice = await db.invoice.findUnique({
          where: { id: invoiceId },
          include: { trip: { select: { truckId: true } } },
        })
        if (invoice?.trip) {
          truckId = invoice.trip.truckId
        }
      }
    }

    if (!truckId) {
      // Use the first available truck as a fallback
      const firstTruck = await db.truck.findFirst({ select: { id: true } })
      truckId = firstTruck?.id
    }

    if (truckId) {
      await db.expense.create({
        data: {
          truckId,
          category: channel === 'mobile_money' ? 'mobile_money' : 'bank_transfer',
          description: `Payment received via ${channel} — Ref: ${reference}${invoiceId ? ` (Invoice linked)` : ''}`,
          amount: amountGHS,
          date: paymentData.paid_at ? new Date(paymentData.paid_at) : new Date(),
          paymentMethod: channel === 'mobile_money' ? 'mobile_money' : 'bank_transfer',
          reference: reference,
          status: 'approved',
          approvedBy: initiatedBy || null,
          tripId: invoiceId ? (await db.invoice.findUnique({
            where: { id: invoiceId },
            select: { tripId: true },
          }))?.tripId || null : null,
        },
      })
    }
  } catch (err) {
    console.error('[PAYSTACK] Failed to create expense record:', err)
  }
}

// POST /api/payments/paystack/verify — Verify and process a payment
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const body = await request.json()
    const { reference } = body

    if (!reference) {
      return NextResponse.json(
        { error: 'Payment reference is required.' },
        { status: 400 }
      )
    }

    // Verify the payment with Paystack
    const result = await verifyPayment(reference)

    if (!result.status) {
      return NextResponse.json(
        { error: result.message, verified: false },
        { status: 400 }
      )
    }

    const paymentData = result.data

    // Check if payment was successful
    if (paymentData.status !== 'success') {
      return NextResponse.json({
        verified: true,
        status: paymentData.status,
        gateway_response: paymentData.gateway_response,
        reference: paymentData.reference,
        message: `Payment is ${paymentData.status}: ${paymentData.gateway_response}`,
      })
    }

    // Process the successful payment
    await processSuccessfulPayment(paymentData)

    // Audit log (fire-and-forget)
    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'Payment',
      entityId: reference,
      details: {
        amount: paymentData.amount / 100,
        channel: paymentData.channel,
        status: 'verified',
        customerEmail: paymentData.customer?.email,
        verifiedBy: 'user',
      },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json({
      verified: true,
      status: paymentData.status,
      reference: paymentData.reference,
      amount: paymentData.amount,
      currency: paymentData.currency,
      channel: paymentData.channel,
      gateway_response: paymentData.gateway_response,
      paid_at: paymentData.paid_at,
      customer: paymentData.customer,
      metadata: paymentData.metadata,
    })
  } catch (error) {
    console.error('[PAYSTACK] Verify error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to verify payment.' },
      { status: 500 }
    )
  }
}
