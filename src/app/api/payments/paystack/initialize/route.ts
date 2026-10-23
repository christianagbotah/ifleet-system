import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { initializePayment, isPaystackEnabled, generateReference } from '@/lib/services/paystack'
import { createAuditLog, getClientIp } from '@/lib/audit'
import { APP_NAME } from '@/lib/constants'
import { db } from '@/lib/db'

const PAYABLE_INVOICE_STATUSES = new Set(['pending', 'sent', 'partially_paid', 'overdue'])

function money(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : NaN
}

// POST /api/payments/paystack/initialize — Start an invoice receipt payment
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const enabled = await isPaystackEnabled()
    if (!enabled) {
      return NextResponse.json(
        { error: 'Paystack payments are not enabled. Configure it in Settings → Channels.' },
        { status: 400 },
      )
    }

    const body = await request.json()
    const { invoiceId, amount, email, description, channel, phone, mobileMoneyProvider } = body

    if (!invoiceId || typeof invoiceId !== 'string') {
      return NextResponse.json({ error: 'Invoice is required for Paystack charge collection.' }, { status: 400 })
    }

    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId },
      include: { client: { select: { email: true } } },
    })
    if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
    if (!PAYABLE_INVOICE_STATUSES.has(invoice.status)) {
      return NextResponse.json({ error: `Invoice status "${invoice.status}" cannot accept a Paystack payment.` }, { status: 400 })
    }

    const totalAmount = money(invoice.totalAmount)
    const paidAmount = money(invoice.paidAmount)
    const outstandingAmount = Math.max(0, Math.round((totalAmount - paidAmount) * 100) / 100)
    if (outstandingAmount <= 0) {
      return NextResponse.json({ error: 'Invoice has no outstanding balance.' }, { status: 400 })
    }

    const requestedAmount = amount === undefined || amount === null || amount === '' ? outstandingAmount : money(amount)
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return NextResponse.json({ error: 'Payment amount must be greater than zero.' }, { status: 400 })
    }
    if (requestedAmount > outstandingAmount) {
      return NextResponse.json({ error: 'Payment amount cannot exceed the invoice outstanding balance.' }, { status: 400 })
    }

    const payerEmail = (typeof email === 'string' && email.trim()) || invoice.client.email || ''
    if (!payerEmail) {
      return NextResponse.json({ error: 'A payer email is required to initialize Paystack.' }, { status: 400 })
    }

    const channels: string[] = channel === 'mobile_money'
      ? ['mobile_money']
      : channel === 'card'
        ? ['card']
        : ['mobile_money', 'card']

    let mobileMoney: { phone: string; provider: 'mtn' | 'vodafone' | 'airteltigo' } | undefined
    if (channels.includes('mobile_money') && typeof phone === 'string' && phone.trim()) {
      let normalizedPhone = phone.replace(/\s/g, '')
      if (normalizedPhone.startsWith('+233')) normalizedPhone = `0${normalizedPhone.slice(4)}`
      else if (normalizedPhone.startsWith('233') && normalizedPhone.length === 12) normalizedPhone = `0${normalizedPhone.slice(3)}`
      if (!normalizedPhone.startsWith('0')) normalizedPhone = `0${normalizedPhone}`
      mobileMoney = {
        phone: normalizedPhone,
        provider: (mobileMoneyProvider || 'mtn') as 'mtn' | 'vodafone' | 'airteltigo',
      }
    }

    const reference = generateReference('FP-PAY')
    const metadata: Record<string, unknown> = {
      invoiceId: invoice.id,
      initiatedBy: auth.userId,
      initiatedByRole: auth.roleName,
      description: description || `${APP_NAME} invoice payment`,
    }

    await db.paymentTransaction.create({
      data: {
        provider: 'paystack',
        reference,
        status: 'pending',
        requestedAmount,
        currency: 'GHS',
        invoiceId: invoice.id,
        customerEmail: payerEmail,
        initiatedBy: auth.userId,
        providerMetadata: JSON.stringify(metadata),
      },
    })

    try {
      const result = await initializePayment({
        email: payerEmail,
        amount: Math.round(requestedAmount * 100),
        reference,
        metadata,
        channels,
        mobile_money: mobileMoney,
      })

      if (result.data.reference !== reference) {
        await db.paymentTransaction.update({
          where: { provider_reference: { provider: 'paystack', reference } },
          data: { status: 'failed', lastError: 'Paystack returned a different transaction reference.' },
        })
        return NextResponse.json({ error: 'Paystack returned an unexpected payment reference.' }, { status: 502 })
      }

      createAuditLog({
        userId: auth.userId,
        action: 'create',
        entity: 'Payment',
        entityId: reference,
        details: {
          amount: requestedAmount,
          channel: channels.join(','),
          email: payerEmail,
          invoiceId: invoice.id,
          reference,
        },
        ipAddress: getClientIp(request),
      }).catch(() => {})

      return NextResponse.json({
        authorization_url: result.data.authorization_url,
        reference,
        access_code: result.data.access_code,
        invoiceId: invoice.id,
        amount: requestedAmount,
        currency: 'GHS',
      })
    } catch (error) {
      await db.paymentTransaction.update({
        where: { provider_reference: { provider: 'paystack', reference } },
        data: { status: 'failed', lastError: error instanceof Error ? error.message : 'Paystack initialization failed.' },
      }).catch(() => {})
      throw error
    }
  } catch (error) {
    console.error('[PAYSTACK] Initialize error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to initialize payment.' },
      { status: 500 },
    )
  }
}
