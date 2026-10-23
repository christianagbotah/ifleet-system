import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, ROLES } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'
import { validatePaystackSecretKeyForMode, type PaystackMode } from '@/lib/services/paystack'

// Helper: mask a secret string — show first 3 + last 2 chars, rest as dots
function maskSecret(value: string): string {
  if (!value) return ''
  if (value.length <= 5) return '•••••'
  return value.slice(0, 3) + '•••••' + value.slice(-2)
}

// GET /api/settings/channels — Return channel config (secrets masked)
export async function GET(request: NextRequest) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    let settings = await db.systemSettings.findFirst()

    if (!settings) {
      settings = await db.systemSettings.create({ data: {} })
    }

    return NextResponse.json({
      // SMS
      smsEnabled: settings.smsEnabled,
      smsProvider: settings.smsProvider,
      hubtelClientId: settings.hubtelClientId || '',
      hubtelApiSecret: settings.hubtelApiSecret ? maskSecret(settings.hubtelApiSecret) : '',
      arkeselApiKey: settings.arkeselApiKey ? maskSecret(settings.arkeselApiKey) : '',
      arkeselSenderId: settings.arkeselSenderId || '',
      // Email
      emailEnabled: settings.emailEnabled,
      smtpHost: settings.smtpHost || '',
      smtpPort: settings.smtpPort,
      smtpUser: settings.smtpUser || '',
      smtpFrom: settings.smtpFrom || '',
      smtpSecure: settings.smtpSecure,
      hasSmtpPass: !!settings.smtpPass,
      // Paystack
      paystackEnabled: settings.paystackEnabled,
      paystackSecretKey: settings.paystackSecretKey ? maskSecret(settings.paystackSecretKey) : '',
      paystackPublicKey: settings.paystackPublicKey || '',
      paystackMode: settings.paystackMode || 'test',
      mobileMoneyProvider: settings.mobileMoneyProvider || 'mtn',
      hasPaystackSecret: !!settings.paystackSecretKey,
    })
  } catch (error) {
    console.error('Channel Settings GET error:', error)
    return NextResponse.json(
      { error: 'Failed to load channel settings. Please try again.' },
      { status: 500 }
    )
  }
}

// PUT /api/settings/channels — Update channel config
export async function PUT(request: NextRequest) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const body = await request.json()
    const {
      smsEnabled,
      smsProvider,
      hubtelClientId,
      hubtelApiSecret,
      arkeselApiKey,
      arkeselSenderId,
      emailEnabled,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      smtpFrom,
      smtpSecure,
      // Paystack fields
      paystackEnabled,
      paystackSecretKey,
      paystackPublicKey,
      paystackMode,
      mobileMoneyProvider,
    } = body

    // Upsert: find existing or create new
    const existing = await db.systemSettings.findFirst()

    if (smsProvider !== undefined && smsProvider !== 'hubtel') {
      return NextResponse.json(
        { error: 'Unsupported SMS provider. Fleetivo currently supports Hubtel.' },
        { status: 400 },
      )
    }

    if (paystackMode !== undefined && paystackMode !== 'test' && paystackMode !== 'live') {
      return NextResponse.json({ error: 'Paystack mode must be test or live.' }, { status: 400 })
    }
    if (paystackSecretKey !== undefined && typeof paystackSecretKey !== 'string') {
      return NextResponse.json({ error: 'Paystack secret key must be a string.' }, { status: 400 })
    }

    const effectivePaystackMode: PaystackMode = paystackMode === 'live'
      ? 'live'
      : paystackMode === 'test'
        ? 'test'
        : existing?.paystackMode === 'live'
          ? 'live'
          : 'test'
    const effectivePaystackSecret = typeof paystackSecretKey === 'string' && paystackSecretKey !== ''
      ? paystackSecretKey
      : existing?.paystackSecretKey ?? ''
    const effectivePaystackEnabled = paystackEnabled === undefined
      ? existing?.paystackEnabled ?? false
      : paystackEnabled === true

    if (effectivePaystackEnabled) {
      if (!effectivePaystackSecret) {
        return NextResponse.json(
          { error: 'Paystack secret key is required when Paystack is enabled.' },
          { status: 400 },
        )
      }
      const validationError = validatePaystackSecretKeyForMode(effectivePaystackSecret, effectivePaystackMode)
      if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })
    }

    // Build update data — only include fields that are provided
    const updateData: Record<string, unknown> = {}

    if (smsEnabled !== undefined) updateData.smsEnabled = smsEnabled
    if (smsProvider !== undefined) updateData.smsProvider = smsProvider

    // Only update secrets if a non-empty value is provided
    if (hubtelClientId !== undefined) updateData.hubtelClientId = hubtelClientId
    if (hubtelApiSecret !== undefined && hubtelApiSecret !== '') updateData.hubtelApiSecret = hubtelApiSecret
    if (arkeselApiKey !== undefined && arkeselApiKey !== '') updateData.arkeselApiKey = arkeselApiKey
    if (arkeselSenderId !== undefined) updateData.arkeselSenderId = arkeselSenderId

    if (emailEnabled !== undefined) updateData.emailEnabled = emailEnabled
    if (smtpHost !== undefined) updateData.smtpHost = smtpHost
    if (smtpPort !== undefined) updateData.smtpPort = smtpPort
    if (smtpUser !== undefined) updateData.smtpUser = smtpUser
    // Only update password if a non-empty value is provided
    if (smtpPass !== undefined && smtpPass !== '') updateData.smtpPass = smtpPass
    if (smtpFrom !== undefined) updateData.smtpFrom = smtpFrom
    if (smtpSecure !== undefined) updateData.smtpSecure = smtpSecure

    // Paystack fields
    if (paystackEnabled !== undefined) updateData.paystackEnabled = paystackEnabled
    if (paystackSecretKey !== undefined && paystackSecretKey !== '') updateData.paystackSecretKey = paystackSecretKey
    if (paystackPublicKey !== undefined) updateData.paystackPublicKey = paystackPublicKey
    if (paystackMode !== undefined) updateData.paystackMode = paystackMode
    if (mobileMoneyProvider !== undefined) updateData.mobileMoneyProvider = mobileMoneyProvider

    const settings = await db.systemSettings.upsert({
      where: existing ? { id: existing.id } : { id: '__none__' },
      create: {
        smsEnabled: smsEnabled ?? false,
        smsProvider: smsProvider ?? 'hubtel',
        hubtelClientId: hubtelClientId ?? '',
        hubtelApiSecret: hubtelApiSecret ?? '',
        arkeselApiKey: arkeselApiKey ?? '',
        arkeselSenderId: arkeselSenderId ?? '',
        emailEnabled: emailEnabled ?? false,
        smtpHost: smtpHost ?? '',
        smtpPort: smtpPort ?? 587,
        smtpUser: smtpUser ?? '',
        smtpPass: smtpPass ?? '',
        smtpFrom: smtpFrom ?? '',
        smtpSecure: smtpSecure ?? true,
        paystackEnabled: paystackEnabled ?? false,
        paystackSecretKey: paystackSecretKey ?? '',
        paystackPublicKey: paystackPublicKey ?? '',
        paystackMode: paystackMode ?? 'test',
        mobileMoneyProvider: mobileMoneyProvider ?? 'mtn',
      },
      update: updateData,
    })

    // Audit log: channel settings changed (fire-and-forget)
    createAuditLog({
      userId: auth.userId,
      action: 'settings_change',
      entity: 'ChannelSettings',
      entityId: settings.id,
      details: { smsEnabled, smsProvider, emailEnabled, paystackEnabled, paystackMode },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json({
      // SMS
      smsEnabled: settings.smsEnabled,
      smsProvider: settings.smsProvider,
      hubtelClientId: settings.hubtelClientId || '',
      hubtelApiSecret: settings.hubtelApiSecret ? maskSecret(settings.hubtelApiSecret) : '',
      arkeselApiKey: settings.arkeselApiKey ? maskSecret(settings.arkeselApiKey) : '',
      arkeselSenderId: settings.arkeselSenderId || '',
      // Email
      emailEnabled: settings.emailEnabled,
      smtpHost: settings.smtpHost || '',
      smtpPort: settings.smtpPort,
      smtpUser: settings.smtpUser || '',
      smtpFrom: settings.smtpFrom || '',
      smtpSecure: settings.smtpSecure,
      hasSmtpPass: !!settings.smtpPass,
      // Paystack
      paystackEnabled: settings.paystackEnabled,
      paystackSecretKey: settings.paystackSecretKey ? maskSecret(settings.paystackSecretKey) : '',
      paystackPublicKey: settings.paystackPublicKey || '',
      paystackMode: settings.paystackMode || 'test',
      mobileMoneyProvider: settings.mobileMoneyProvider || 'mtn',
      hasPaystackSecret: !!settings.paystackSecretKey,
    })
  } catch (error) {
    console.error('Channel Settings PUT error:', error)
    const message = error instanceof Error
      ? `Failed to save channel settings: ${error.message}`
      : 'Failed to save channel settings due to a server error. Please try again.'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
