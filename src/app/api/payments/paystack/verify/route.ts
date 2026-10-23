import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { verifyPayment } from '@/lib/services/paystack'
import { processSuccessfulPaystackCharge } from '@/lib/domain/payments/process-paystack-charge'
import { createAuditLog, getClientIp } from '@/lib/audit'

// POST /api/payments/paystack/verify — Verify and apply a registered invoice charge
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { reference } = body
    if (!reference || typeof reference !== 'string') {
      return NextResponse.json({ error: 'Payment reference is required.' }, { status: 400 })
    }

    const result = await verifyPayment(reference)
    if (!result.status) {
      return NextResponse.json({ error: result.message, verified: false }, { status: 400 })
    }

    const paymentData = result.data
    if (paymentData.status !== 'success') {
      return NextResponse.json({
        verified: true,
        status: paymentData.status,
        gateway_response: paymentData.gateway_response,
        reference: paymentData.reference,
        message: `Payment is ${paymentData.status}: ${paymentData.gateway_response}`,
      })
    }

    const application = await processSuccessfulPaystackCharge(paymentData, 'verify')

    createAuditLog({
      userId: auth.userId,
      action: 'update',
      entity: 'Payment',
      entityId: reference,
      details: {
        amount: paymentData.amount / 100,
        channel: paymentData.channel,
        status: paymentData.status,
        applicationStatus: application.status,
        alreadyProcessed: application.alreadyProcessed,
        appliedAmount: application.appliedAmount,
        unappliedAmount: application.unappliedAmount,
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
      application,
    })
  } catch (error) {
    console.error('[PAYSTACK] Verify error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to verify payment.' },
      { status: 500 },
    )
  }
}
