import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { initializePayment, isPaystackEnabled, generateReference } from '@/lib/services/paystack'
import { createAuditLog, getClientIp } from '@/lib/audit'
import { APP_NAME } from '@/lib/constants'

// POST /api/payments/paystack/initialize — Start a new payment
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    // Check if Paystack is enabled
    const enabled = await isPaystackEnabled()
    if (!enabled) {
      return NextResponse.json(
        { error: 'Paystack payments are not enabled. Configure it in Settings → Channels.' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const {
      email,
      amount,
      description,
      invoiceId,
      settlementId,
      channel,
      phone,
      mobileMoneyProvider,
    } = body

    // Validate required fields
    if (!email || !amount) {
      return NextResponse.json(
        { error: 'Email and amount are required.' },
        { status: 400 }
      )
    }

    // Amount must be in GHS (we convert to kobo/gpesewas: * 100)
    const amountInKobo = Math.round(Number(amount) * 100)
    if (amountInKobo <= 0) {
      return NextResponse.json(
        { error: 'Amount must be greater than zero.' },
        { status: 400 }
      )
    }

    // Build channels array
    const channels: string[] = []
    if (channel === 'mobile_money') {
      channels.push('mobile_money')
    } else if (channel === 'card') {
      channels.push('card')
    } else {
      // Default: both
      channels.push('mobile_money', 'card')
    }

    // Build mobile_money object if applicable
    let mobileMoney: { phone: string; provider: 'mtn' | 'vodafone' | 'airteltigo' } | undefined
    if (channels.includes('mobile_money') && phone) {
      // Normalize Ghana phone number
      let normalizedPhone = phone.replace(/\s/g, '')
      if (normalizedPhone.startsWith('+233')) {
        normalizedPhone = '0' + normalizedPhone.slice(4)
      } else if (normalizedPhone.startsWith('233') && normalizedPhone.length === 12) {
        normalizedPhone = '0' + normalizedPhone.slice(3)
      }
      // If still not 0xxx format, just use as-is
      if (!normalizedPhone.startsWith('0')) {
        normalizedPhone = '0' + normalizedPhone
      }

      mobileMoney = {
        phone: normalizedPhone,
        provider: (mobileMoneyProvider || 'mtn') as 'mtn' | 'vodafone' | 'airteltigo',
      }
    }

    // Generate a unique reference
    const reference = generateReference('FP-PAY')

    // Build metadata
    const metadata: Record<string, unknown> = {
      initiatedBy: auth.userId,
      initiatedByRole: auth.roleName,
      description: description || `${APP_NAME} Payment`,
    }
    if (invoiceId) metadata.invoiceId = invoiceId
    if (settlementId) metadata.settlementId = settlementId

    // Initialize the payment
    const result = await initializePayment({
      email,
      amount: amountInKobo,
      reference,
      metadata,
      channels,
      mobile_money: mobileMoney,
    })

    // Audit log (fire-and-forget)
    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'Payment',
      entityId: reference,
      details: {
        amount: Number(amount),
        channel: channels.join(','),
        email,
        invoiceId: invoiceId || null,
        settlementId: settlementId || null,
        reference: result.data.reference,
      },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json({
      authorization_url: result.data.authorization_url,
      reference: result.data.reference,
      access_code: result.data.access_code,
    })
  } catch (error) {
    console.error('[PAYSTACK] Initialize error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to initialize payment.' },
      { status: 500 }
    )
  }
}
