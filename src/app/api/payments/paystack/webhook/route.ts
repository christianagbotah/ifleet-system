import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Verify Paystack webhook signature using HMAC-SHA512.
 * Paystack sends an `x-paystack-signature` header computed from the raw body + webhook secret.
 */
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
    const hash = crypto
      .createHmac('sha512', webhookSecret)
      .update(body)
      .digest('hex')
    return hash === signature
  } catch {
    return false
  }
}

/**
 * Process a verified payment — update linked entities.
 * This mirrors the logic in verify/route.ts.
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
  const { reference, amount, channel, metadata } = paymentData
  const invoiceId = metadata?.invoiceId as string | undefined
  const settlementId = metadata?.settlementId as string | undefined
  const initiatedBy = metadata?.initiatedBy as string | undefined
  const amountGHS = amount / 100

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
      console.error('[PAYSTACK WEBHOOK] Failed to update invoice:', invoiceId, err)
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
      console.error('[PAYSTACK WEBHOOK] Failed to update settlement:', settlementId, err)
    }
  }

  // Create an Expense record for the payment
  try {
    let truckId = metadata?.truckId as string | undefined

    if (!truckId && invoiceId) {
      const invoice = await db.invoice.findUnique({
        where: { id: invoiceId },
        include: { trip: { select: { truckId: true } } },
      })
      if (invoice?.trip) {
        truckId = invoice.trip.truckId
      }
    }

    if (!truckId) {
      const firstTruck = await db.truck.findFirst({ select: { id: true } })
      truckId = firstTruck?.id
    }

    if (truckId) {
      await db.expense.create({
        data: {
          truckId,
          category: channel === 'mobile_money' ? 'mobile_money' : 'bank_transfer',
          description: `Payment received via ${channel} — Ref: ${reference}${invoiceId ? ' (Invoice linked)' : ''}`,
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
    console.error('[PAYSTACK WEBHOOK] Failed to create expense record:', err)
  }
}

// POST /api/payments/paystack/webhook — Paystack webhook endpoint
// NO auth required — Paystack calls this directly
export async function POST(request: NextRequest) {
  try {
    // Read raw body for signature verification
    const rawBody = await request.text()
    const signature = request.headers.get('x-paystack-signature')

    // Verify signature
    const isValid = await verifyWebhookSignature(rawBody, signature)
    if (!isValid) {
      console.warn('[PAYSTACK WEBHOOK] Invalid or missing signature.')
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      )
    }

    // Parse the event
    const event = JSON.parse(rawBody)
    const eventType = event.event as string
    const eventData = event.data as Record<string, unknown>

    console.log(`[PAYSTACK WEBHOOK] Received event: ${eventType}`, eventData?.reference || '')

    switch (eventType) {
      case 'charge.success': {
        // Extract payment data from the event
        const paymentData = {
          reference: (eventData.reference as string) || '',
          amount: (eventData.amount as number) || 0,
          status: (eventData.status as string) || '',
          channel: (eventData.channel as string) || 'card',
          customer: {
            email: (eventData.customer as Record<string, string>)?.email || '',
            first_name: (eventData.customer as Record<string, string>)?.first_name,
            last_name: (eventData.customer as Record<string, string>)?.last_name,
            phone: (eventData.customer as Record<string, string>)?.phone,
          },
          metadata: (eventData.metadata as Record<string, unknown>) || {},
          paid_at: (eventData.paid_at as string) || undefined,
          gateway_response: (eventData.gateway_response as string) || '',
        }

        // Only process if status is 'success'
        if (paymentData.status === 'success' && paymentData.reference) {
          await processSuccessfulPayment(paymentData)
          console.log(`[PAYSTACK WEBHOOK] Processed charge.success for ${paymentData.reference}`)
        }
        break
      }

      case 'charge.failed': {
        console.log(`[PAYSTACK WEBHOOK] Charge failed: ${eventData?.reference}`, eventData?.gateway_response)
        break
      }

      case 'transfer.success': {
        console.log(`[PAYSTACK WEBHOOK] Transfer success: ${eventData?.reference}`)
        break
      }

      case 'transfer.failed': {
        console.log(`[PAYSTACK WEBHOOK] Transfer failed: ${eventData?.reference}`)
        break
      }

      default:
        console.log(`[PAYSTACK WEBHOOK] Unhandled event: ${eventType}`)
        break
    }

    // Always return 200 quickly so Paystack knows we received it
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[PAYSTACK WEBHOOK] Error processing webhook:', error)
    // Return 200 to prevent Paystack from retrying malformed payloads endlessly
    return NextResponse.json({ received: true, error: 'Processing error' })
  }
}

// GET /api/payments/paystack/webhook — Return webhook URL info (for testing)
export async function GET() {
  return NextResponse.json({
    message: 'Paystack webhook endpoint. Configure this URL in your Paystack dashboard.',
    url: '/api/payments/paystack/webhook',
  })
}
