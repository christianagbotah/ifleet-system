import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import nodemailer from 'nodemailer'
import { requireRole, ROLES } from '@/lib/auth-server'
import { APP_NAME, APP_COMPANY } from '@/lib/constants'

// POST /api/settings/channels/test-email — Send a test email
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

    if (!settings.emailEnabled) {
      return NextResponse.json(
        { success: false, message: 'Email is not enabled. Enable it in Channel Settings first.' },
        { status: 400 }
      )
    }

    if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPass) {
      return NextResponse.json(
        { success: false, message: 'SMTP is not fully configured. Please fill in SMTP Host, Username, and Password.' },
        { status: 400 }
      )
    }

    // Get email from request body or use admin's email
    const body = await request.json().catch(() => ({}))
    let toEmail = body?.email

    if (!toEmail) {
      // Try to find an admin user with an email
      const admin = await db.user.findFirst({
        where: {
          role: { name: 'Admin' },
        },
      })
      toEmail = admin?.email
    }

    if (!toEmail) {
      return NextResponse.json(
        { success: false, message: 'No email address available. Provide an email or set one on your user profile.' },
        { status: 400 }
      )
    }

    const fromEmail = settings.smtpFrom || settings.smtpUser
    const portNum = settings.smtpPort || 587
    const isSecure = settings.smtpSecure || false

    // Create a temporary transporter with the DB settings
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: portNum,
      secure: isSecure,
      auth: {
        user: settings.smtpUser,
        pass: settings.smtpPass,
      },
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 15000,
    })

    const now = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Accra' })

    const htmlEmail = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:20px 0;">
    <tr>
      <td align="center" style="padding:20px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);max-width:600px;width:100%;">
          <tr>
            <td style="background:linear-gradient(135deg,#d97706,#b45309);padding:28px 32px;text-align:center;">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#fff;">${APP_NAME}</h1>
              <p style="margin:4px 0 0 0;font-size:13px;color:rgba(255,255,255,0.85);">Email Channel Test</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <h2 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#111827;">Email Channel is Working!</h2>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
                This is a test email from ${APP_NAME}. If you received this, your SMTP email configuration is working correctly.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="padding:16px 20px;background:#fef3c7;border-bottom:1px solid #fde68a;">
                    <p style="margin:0;font-size:13px;font-weight:600;color:#92400e;">Test Details</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;font-size:13px;color:#374151;">
                    <p style="margin:0 0 8px;"><strong>SMTP Host:</strong> ${settings.smtpHost}</p>
                    <p style="margin:0 0 8px;"><strong>SMTP Port:</strong> ${portNum}</p>
                    <p style="margin:0 0 8px;"><strong>TLS:</strong> ${isSecure ? 'Enabled' : 'Disabled'}</p>
                    <p style="margin:0 0 8px;"><strong>From:</strong> ${fromEmail}</p>
                    <p style="margin:0;"><strong>Sent At:</strong> ${now}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#374151;">${APP_COMPANY}</p>
              <p style="margin:0;font-size:12px;color:#6b7280;">37 Ring Road Central, Accra, Ghana</p>
              <p style="margin:8px 0 0;font-size:11px;color:#9ca3af;">This is an automated test message from ${APP_NAME}.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

    try {
      const info = await transporter.sendMail({
        from: `"${APP_NAME}" <${fromEmail}>`,
        to: toEmail,
        subject: `${APP_NAME} — Email Channel Test`,
        html: htmlEmail,
        text: `${APP_NAME} — Email Channel Test\n\nThis is a test email. If you received this, your SMTP configuration is working.\n\nSMTP Host: ${settings.smtpHost}\nSMTP Port: ${portNum}\nTLS: ${isSecure ? 'Enabled' : 'Disabled'}\nFrom: ${fromEmail}\nSent At: ${now}\n\n— ${APP_COMPANY}`,
      })

      console.log(`[Test Email] Sent successfully. MessageId: ${info.messageId}`)

      return NextResponse.json({
        success: true,
        message: `Test email sent successfully to ${toEmail}`,
      })
    } catch (sendError) {
      const errorMessage = sendError instanceof Error ? sendError.message : 'Unknown error'
      console.error(`[Test Email] Failed: ${errorMessage}`)

      return NextResponse.json({
        success: false,
        message: `Failed to send test email: ${errorMessage}`,
      })
    }
  } catch (error) {
    console.error('Test Email error:', error)
    return NextResponse.json(
      { success: false, message: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}
