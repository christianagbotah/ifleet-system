import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendSMS, formatGhanaPhone } from '@/lib/services/sms'
import { requireRole, ROLES } from '@/lib/auth-server'
import { APP_NAME } from '@/lib/constants'

// POST /api/settings/channels/test-sms — Send a test SMS
export async function POST(request: NextRequest) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    // Get channel settings from DB
    let settings = await db.systemSettings.findFirst()
    if (!settings) {
      return NextResponse.json(
        { success: false, message: 'Channel settings not found. Please save your settings first.' },
        { status: 400 }
      )
    }

    if (!settings.smsEnabled) {
      return NextResponse.json(
        { success: false, message: 'SMS is not enabled. Enable it in Channel Settings first.' },
        { status: 400 }
      )
    }

    // Get phone number from request body or use admin's phone
    const body = await request.json().catch(() => ({}))
    let phone = body?.phone

    if (!phone) {
      // Try to find an admin user with a phone number
      const admin = await db.user.findFirst({
        where: {
          role: { name: 'Admin' },
          phone: { not: '' },
        },
      })
      phone = admin?.phone
    }

    if (!phone) {
      return NextResponse.json(
        { success: false, message: 'No phone number available. Provide a phone number or set one on your user profile.' },
        { status: 400 }
      )
    }

    // Override env vars with DB settings for the test
    const originalClientId = process.env.HUBTEL_CLIENT_ID
    const originalApiSecret = process.env.HUBTEL_API_SECRET

    if (settings.smsProvider === 'hubtel' && settings.hubtelClientId && settings.hubtelApiSecret) {
      process.env.HUBTEL_CLIENT_ID = settings.hubtelClientId
      process.env.HUBTEL_API_SECRET = settings.hubtelApiSecret
    }

    try {
      const formattedPhone = formatGhanaPhone(phone)
      const result = await sendSMS({
        to: formattedPhone,
        message: `${APP_NAME} Test SMS — Your SMS channel is working! Sent at ${new Date().toLocaleString('en-GB', { timeZone: 'Africa/Accra' })}`,
      })

      if (result.success) {
        return NextResponse.json({
          success: true,
          message: `Test SMS sent successfully to ${formattedPhone}`,
        })
      } else {
        return NextResponse.json({
          success: false,
          message: `Failed to send test SMS: ${result.error}`,
        })
      }
    } finally {
      // Restore original env vars
      if (originalClientId !== undefined) process.env.HUBTEL_CLIENT_ID = originalClientId
      else delete process.env.HUBTEL_CLIENT_ID
      if (originalApiSecret !== undefined) process.env.HUBTEL_API_SECRET = originalApiSecret
      else delete process.env.HUBTEL_API_SECRET
    }
  } catch (error) {
    console.error('Test SMS error:', error)
    return NextResponse.json(
      { success: false, message: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}
