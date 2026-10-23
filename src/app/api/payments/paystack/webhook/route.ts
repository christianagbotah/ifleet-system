import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { PaymentData } from '@/lib/services/paystack'
import { processSuccessfulPaystackCharge } from '@/lib/domain/payments/process-paystack-charge'

async function verifyWebhookSignature(body: string, signature: string | null): Promise<boolean> {
  if (!signature) return false
  const settings = await db.systemSettings.findFirst()
  const webhookSecret = settings?.paystackWebhookSecret
  if (!webhookSecret) {
    console.error('[PAYSTACK WEBHOOK] No webhook secret configured — rejecting request.')
    return false
  }

  try {
    const crypto = await import('crypto')
    const hash = crypto.createHmac('sha512', webhookSecret).update(body).digest('hex')
    return hash === signature
  } catch {
    return false
  }
}

// POST /api/payments/paystack/webhook — Paystack webhook endpoint
// No user auth: authenticity comes from the Paystack HMAC signature.
export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-paystack-signature')

  const isValid = await verifyWebhookSignature(rawBody, signature)
  if (!isValid) {
    console.warn('[PAYSTACK WEBHOOK] Invalid or missing signature.')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  try {
    const event = JSON.parse(rawBody)
    const eventType = event.event as string
    const eventData = event.data as Record<string, unknown>
    console.log(`[PAYSTACK WEBHOOK] Received event: ${eventType}`, eventData?.reference || '')

    switch (eventType) {
      case 'charge.success': {
        const customer = (eventData.customer || {}) as Record<string, string>
        const paymentData: PaymentData = {
          id: typeof eventData.id === 'number' ? eventData.id : undefined,
          reference: (eventData.reference as string) || '',
          amount: Number(eventData.amount || 0),
          status: (eventData.status as string) || '',
          channel: (eventData.channel as string) || 'card',
          currency: (eventData.currency as string) || '',
          customer: {
            email: customer.email || '',
            first_name: customer.first_name,
            last_name: customer.last_name,
            phone: customer.phone,
          },
          metadata: (eventData.metadata as Record<string, unknown>) || {},
          paid_at: (eventData.paid_at as string) || undefined,
          gateway_response: (eventData.gateway_response as string) || '',
        }

        if (paymentData.status === 'success' && paymentData.reference) {
          const application = await processSuccessfulPaystackCharge(paymentData, 'webhook')
          console.log(`[PAYSTACK WEBHOOK] charge.success ${paymentData.reference}: ${application.status}`)
        }
        break
      }

      case 'charge.failed': {
        const reference = (eventData.reference as string) || ''
        if (reference) {
          await db.paymentTransaction.updateMany({
            where: { provider: 'paystack', reference, status: 'pending' },
            data: {
              status: 'failed',
              gatewayResponse: (eventData.gateway_response as string) || null,
              lastError: 'Paystack reported charge.failed.',
              processedAt: new Date(),
              source: 'webhook',
            },
          })
        }
        break
      }

      case 'transfer.success':
      case 'transfer.failed':
        console.log(`[PAYSTACK WEBHOOK] ${eventType}: ${eventData?.reference || ''} (transfer handling is separate from charge collection)`)
        break

      default:
        console.log(`[PAYSTACK WEBHOOK] Unhandled event: ${eventType}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[PAYSTACK WEBHOOK] Processing error:', error)
    // A valid Paystack request that cannot be durably processed must be retried.
    return NextResponse.json({ error: 'Processing error' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Paystack webhook endpoint. Configure this URL in your Paystack dashboard.',
    url: '/api/payments/paystack/webhook',
  })
}
