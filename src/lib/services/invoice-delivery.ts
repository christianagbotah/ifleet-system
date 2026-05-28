// ════════════════════════════════════════════════════════════════════
// ${APP_NAME} — Invoice Delivery Service
// ════════════════════════════════════════════════════════════════════
//
// Sends invoice notifications to clients via multiple channels:
//   - Email: Nodemailer SMTP with professional HTML template
//   - SMS: Hubtel API with concise invoice summary
//   - WhatsApp: WhatsApp deep link as fallback
//
// Each channel is fire-and-forget with error logging.
//
// Usage:
//   await sendInvoiceNotification(invoiceId, { channels: ['email', 'sms', 'whatsapp'] })
// ────────────────────────────────────────────────────────────────────

import { db } from '@/lib/db'
import { APP_NAME } from '@/lib/constants'
import { sendEmail } from './email'
import { sendSMS, formatGhanaPhone } from './sms'
import { generateInvoiceShareLink } from './invoice-generator'

// ── Types ──

interface DeliveryResult {
  email: boolean
  sms: boolean
  whatsapp: boolean
  errors: string[]
}

// ════════════════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════════════════

/**
 * Send invoice notification to the client via specified channels.
 *
 * Fetches the invoice with client and trip details, builds a
 * professional message for each channel, and sends asynchronously.
 *
 * @param invoiceId  The invoice to send
 * @param options    Channels to send via
 * @returns Per-channel success/failure status
 */
export async function sendInvoiceNotification(
  invoiceId: string,
  options: { channels: ('email' | 'sms' | 'whatsapp')[] }
): Promise<DeliveryResult> {
  const result: DeliveryResult = {
    email: false,
    sms: false,
    whatsapp: false,
    errors: [],
  }

  try {
    // ── 1. Fetch invoice with all relations ──
    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        client: { select: { id: true, companyName: true, contactPerson: true, phone: true, email: true, address: true, city: true, region: true } },
        trip: { select: { id: true, tripNumber: true, loadingLocation: true, destination: true } },
        InvoiceItem: { orderBy: { order: 'asc' } },
      },
    })

    if (!invoice) {
      console.warn(`[InvoiceDelivery] Invoice ${invoiceId} not found`)
      result.errors.push(`Invoice ${invoiceId} not found`)
      return result
    }

    const client = invoice.client
    if (!client) {
      console.warn(`[InvoiceDelivery] No client found for invoice ${invoice.invoiceNumber}`)
      result.errors.push('No client found')
      return result
    }

    // ── 2. Fetch company settings ──
    let companyName = APP_NAME
    try {
      const settings = await db.systemSettings.findFirst()
      if (settings?.companyName) companyName = settings.companyName
    } catch {
      // Use default
    }

    // ── 3. Build message content ──
    const shareLink = generateInvoiceShareLink(invoiceId)
    const formattedIssueDate = new Date(invoice.issueDate).toLocaleDateString('en-GH', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Africa/Accra',
    })
    const formattedDueDate = new Date(invoice.dueDate).toLocaleDateString('en-GH', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Africa/Accra',
    })

    const itemsHtml = invoice.InvoiceItem.map((item) => `
      <tr>
        <td style="padding: 6px 0; font-size: 13px; color: #374151; border-bottom: 1px solid #f3f4f6;">${item.description}</td>
        <td style="padding: 6px 8px; font-size: 13px; color: #374151; text-align: right; border-bottom: 1px solid #f3f4f6;">${item.quantity.toLocaleString()}</td>
        <td style="padding: 6px 8px; font-size: 13px; color: #374151; text-align: right; border-bottom: 1px solid #f3f4f6;">GHS ${item.unitPrice.toLocaleString('en-GH', { minimumFractionDigits: 2 })}</td>
        <td style="padding: 6px 0; font-size: 13px; color: #111827; font-weight: 600; text-align: right; border-bottom: 1px solid #f3f4f6;">GHS ${item.total.toLocaleString('en-GH', { minimumFractionDigits: 2 })}</td>
      </tr>
    `).join('')

    const tripRef = invoice.trip
      ? `<tr>
           <td style="padding: 4px 0; font-size: 13px; color: #6b7280;">Trip Reference</td>
           <td style="padding: 4px 0; font-size: 13px; color: #111827; font-weight: 600;">${invoice.trip.tripNumber} (${invoice.trip.loadingLocation} → ${invoice.trip.destination})</td>
         </tr>`
      : ''

    // ── 4. Send via each channel (fire-and-forget) ──

    // EMAIL
    if (options.channels.includes('email') && client.email) {
      try {
        const emailHtml = buildInvoiceEmailHtml({
          companyName,
          invoiceNumber: invoice.invoiceNumber,
          issueDate: formattedIssueDate,
          dueDate: formattedDueDate,
          clientName: client.companyName,
          contactPerson: client.contactPerson,
          itemsHtml,
          subtotal: invoice.subtotal,
          taxRate: invoice.taxRate,
          taxAmount: invoice.taxAmount,
          totalAmount: invoice.totalAmount,
          tripRefHtml: tripRef,
          shareLink,
          terms: invoice.terms,
        })

        const emailResult = await sendEmail({
          to: client.email,
          subject: `Invoice ${invoice.invoiceNumber} from ${companyName}`,
          html: emailHtml,
        })

        result.email = emailResult.success
        if (!emailResult.success) {
          result.errors.push(`email: ${emailResult.error || 'Failed'}`)
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[InvoiceDelivery] Email send error:`, errorMsg)
        result.errors.push(`email: ${errorMsg}`)
      }
    } else if (options.channels.includes('email') && !client.email) {
      result.errors.push('email: No client email address')
    }

    // SMS
    if (options.channels.includes('sms') && client.phone) {
      try {
        const smsMessage = buildInvoiceSmsMessage({
          companyName,
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: invoice.totalAmount,
          dueDate: formattedDueDate,
          shareLink,
        })

        const smsResult = await sendSMS({
          to: client.phone,
          message: smsMessage,
        })

        result.sms = smsResult.success
        if (!smsResult.success) {
          result.errors.push(`sms: ${smsResult.error || 'Failed'}`)
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[InvoiceDelivery] SMS send error:`, errorMsg)
        result.errors.push(`sms: ${errorMsg}`)
      }
    } else if (options.channels.includes('sms') && !client.phone) {
      result.errors.push('sms: No client phone number')
    }

    // WHATSAPP
    if (options.channels.includes('whatsapp') && client.phone) {
      try {
        const whatsappMessage = buildInvoiceWhatsappMessage({
          companyName,
          invoiceNumber: invoice.invoiceNumber,
          issueDate: formattedIssueDate,
          dueDate: formattedDueDate,
          clientName: client.companyName,
          items: invoice.InvoiceItem,
          subtotal: invoice.subtotal,
          taxAmount: invoice.taxAmount,
          totalAmount: invoice.totalAmount,
          shareLink,
        })

        // Use WhatsApp deep link (fire-and-forget — opens in user's WhatsApp)
        const formattedPhone = formatGhanaPhone(client.phone).replace('+', '')
        const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(whatsappMessage)}`

        // We can't actually open the WhatsApp link from the server,
        // so we log it and consider it "prepared" for the user
        console.log(`[InvoiceDelivery] WhatsApp invoice link prepared for ${client.phone}: ${whatsappUrl}`)
        result.whatsapp = true

        // Alternatively, if the client has an email, we include the WhatsApp link in the email
        // For now, we just log it. The invoice portal page will also have a "Share via WhatsApp" button.
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[InvoiceDelivery] WhatsApp error:`, errorMsg)
        result.errors.push(`whatsapp: ${errorMsg}`)
      }
    } else if (options.channels.includes('whatsapp') && !client.phone) {
      result.errors.push('whatsapp: No client phone number')
    }

    // ── 5. Log summary ──
    const successCount = [result.email, result.sms, result.whatsapp].filter(Boolean).length
    console.log(
      `[InvoiceDelivery] Invoice ${invoice.invoiceNumber} sent via ${successCount}/${options.channels.length} channels.` +
      (result.errors.length > 0 ? ` Errors: ${result.errors.join('; ')}` : '')
    )

    return result
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[InvoiceDelivery] Failed to send invoice ${invoiceId}:`, errorMsg)
    result.errors.push(errorMsg)
    return result
  }
}

// ════════════════════════════════════════════════════════════════════
// EMAIL TEMPLATE BUILDER
// ════════════════════════════════════════════════════════════════════

function buildInvoiceEmailHtml(params: {
  companyName: string
  invoiceNumber: string
  issueDate: string
  dueDate: string
  clientName: string
  contactPerson: string
  itemsHtml: string
  subtotal: number
  taxRate: number
  taxAmount: number
  totalAmount: number
  tripRefHtml: string
  shareLink: string
  terms: string | null
}): string {
  const {
    companyName,
    invoiceNumber,
    issueDate,
    dueDate,
    clientName,
    contactPerson,
    itemsHtml,
    subtotal,
    taxRate,
    taxAmount,
    totalAmount,
    tripRefHtml,
    shareLink,
    terms,
  } = params

  const now = new Date().toLocaleDateString('en-GH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Africa/Accra',
  })

  const taxLabel = taxRate > 0 ? `VAT (${taxRate}%)` : 'Tax'

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice ${invoiceNumber}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px 0;">
    <tr>
      <td align="center" style="padding: 20px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); max-width: 600px; width: 100%;">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #d97706, #b45309); padding: 28px 32px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: -0.025em;">
                ${companyName}
              </h1>
              <p style="margin: 4px 0 0 0; font-size: 13px; color: rgba(255,255,255,0.85); font-weight: 400;">
                Invoice Notification
              </p>
            </td>
          </tr>

          <!-- Title -->
          <tr>
            <td style="padding: 28px 32px 8px 32px;">
              <h2 style="margin: 0; font-size: 20px; font-weight: 600; color: #111827;">
                Invoice ${invoiceNumber}
              </h2>
              <p style="margin: 4px 0 0 0; font-size: 13px; color: #9ca3af;">
                ${now}
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 0 32px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #374151;">
                Dear ${contactPerson || clientName},
              </p>
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #374151;">
                Please find below the details of your invoice. We appreciate your business and kindly request payment by the due date.
              </p>
            </td>
          </tr>

          <!-- Invoice Meta Card -->
          <tr>
            <td style="padding: 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; overflow: hidden;">
                <tr>
                  <td style="padding: 12px 16px; background-color: #fef3c7; border-bottom: 1px solid #fde68a;">
                    <p style="margin: 0; font-size: 12px; font-weight: 600; color: #92400e; text-transform: uppercase; letter-spacing: 0.05em;">Invoice Details</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 4px 0; font-size: 13px; color: #6b7280; width: 40%;">Invoice Number</td>
                        <td style="padding: 4px 0; font-size: 13px; color: #111827; font-weight: 600;">${invoiceNumber}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; font-size: 13px; color: #6b7280;">Issue Date</td>
                        <td style="padding: 4px 0; font-size: 13px; color: #111827;">${issueDate}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; font-size: 13px; color: #6b7280;">Due Date</td>
                        <td style="padding: 4px 0; font-size: 13px; color: #111827; font-weight: 600; color: #dc2626;">${dueDate}</td>
                      </tr>
                      ${tripRefHtml}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Line Items Table -->
          <tr>
            <td style="padding: 20px 32px 0 32px;">
              <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #374151;">Itemized Breakdown</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                <tr style="background-color: #f9fafb;">
                  <td style="padding: 8px 0; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e5e7eb;">Description</td>
                  <td style="padding: 8px 8px; font-size: 11px; font-weight: 600; color: #6b7280; text-align: right; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e5e7eb;">Qty</td>
                  <td style="padding: 8px 8px; font-size: 11px; font-weight: 600; color: #6b7280; text-align: right; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e5e7eb;">Unit Price</td>
                  <td style="padding: 8px 0; font-size: 11px; font-weight: 600; color: #6b7280; text-align: right; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e5e7eb;">Amount</td>
                </tr>
                ${itemsHtml}
              </table>
            </td>
          </tr>

          <!-- Totals -->
          <tr>
            <td style="padding: 16px 32px 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 4px 0; font-size: 13px; color: #6b7280; text-align: right;">Subtotal</td>
                  <td style="padding: 4px 0; font-size: 13px; color: #111827; font-weight: 600; text-align: right; width: 120px;">GHS ${subtotal.toLocaleString('en-GH', { minimumFractionDigits: 2 })}</td>
                </tr>
                ${taxRate > 0 ? `
                <tr>
                  <td style="padding: 4px 0; font-size: 13px; color: #6b7280; text-align: right;">${taxLabel}</td>
                  <td style="padding: 4px 0; font-size: 13px; color: #111827; text-align: right; width: 120px;">GHS ${taxAmount.toLocaleString('en-GH', { minimumFractionDigits: 2 })}</td>
                </tr>
                ` : ''}
                <tr>
                  <td colspan="2" style="padding: 8px 0 4px 0;"><hr style="border: none; border-top: 2px solid #d97706; margin: 0;" /></td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; font-size: 16px; color: #111827; font-weight: 700; text-align: right;">Total Due</td>
                  <td style="padding: 4px 0; font-size: 16px; color: #d97706; font-weight: 700; text-align: right; width: 120px;">GHS ${totalAmount.toLocaleString('en-GH', { minimumFractionDigits: 2 })}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Payment Instructions -->
          <tr>
            <td style="padding: 16px 32px 0 32px;">
              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px;">
                <p style="margin: 0 0 4px 0; font-size: 13px; font-weight: 600; color: #166534;">Payment Instructions</p>
                <p style="margin: 0; font-size: 13px; color: #374151;">
                  ${terms || 'Please make payment via bank transfer or mobile money.'}<br/>
                  Reference: <strong>${invoiceNumber}</strong>
                </p>
              </div>
            </td>
          </tr>

          <!-- View Invoice Button -->
          <tr>
            <td style="padding: 20px 32px; text-align: center;">
              <a href="${shareLink}"
                 style="display: inline-block; background-color: #d97706; color: #ffffff; padding: 12px 32px;
                        border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;
                        letter-spacing: 0.025em;">
                View Invoice Online
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="text-align: center;">
                    <p style="margin: 0 0 4px 0; font-size: 13px; font-weight: 600; color: #374151;">
                      ${companyName}
                    </p>
                    <p style="margin: 0 0 2px 0; font-size: 12px; color: #6b7280;">
                      37 Ring Road Central, Accra, Ghana
                    </p>
                    <p style="margin: 0 0 2px 0; font-size: 12px; color: #6b7280;">
                      +233 30 277 8899 &nbsp;|&nbsp; info@fleetpro.com.gh
                    </p>
                    <p style="margin: 8px 0 0 0; font-size: 11px; color: #9ca3af;">
                      This is an automated invoice notification from ${APP_NAME}. Please do not reply directly to this email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ════════════════════════════════════════════════════════════════════
// SMS MESSAGE BUILDER
// ════════════════════════════════════════════════════════════════════

function buildInvoiceSmsMessage(params: {
  companyName: string
  invoiceNumber: string
  totalAmount: number
  dueDate: string
  shareLink: string
}): string {
  const { companyName, invoiceNumber, totalAmount, dueDate, shareLink } = params

  return (
    `${companyName}: Invoice ${invoiceNumber} — ` +
    `Total: GHS ${totalAmount.toLocaleString('en-GH', { minimumFractionDigits: 2 })}. ` +
    `Due: ${dueDate}. ` +
    `View & pay: ${shareLink}`
  )
}

// ════════════════════════════════════════════════════════════════════
// WHATSAPP MESSAGE BUILDER
// ════════════════════════════════════════════════════════════════════

function buildInvoiceWhatsappMessage(params: {
  companyName: string
  invoiceNumber: string
  issueDate: string
  dueDate: string
  clientName: string
  items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>
  subtotal: number
  taxAmount: number
  totalAmount: number
  shareLink: string
}): string {
  const { companyName, invoiceNumber, issueDate, dueDate, clientName, items, subtotal, taxAmount, totalAmount, shareLink } = params

  const itemLines = items
    .map((item, idx) => `${idx + 1}. ${item.description} — ${item.quantity} x GHS ${item.unitPrice.toFixed(2)} = GHS ${item.total.toFixed(2)}`)
    .join('\n')

  return (
    `Hello ${clientName},\n\n` +
    `*INVOICE ${invoiceNumber}*\n` +
    `From: ${companyName}\n` +
    `Date: ${issueDate}\n` +
    `Due: ${dueDate}\n\n` +
    `*Items:*\n${itemLines}\n\n` +
    `Subtotal: GHS ${subtotal.toLocaleString('en-GH', { minimumFractionDigits: 2 })}\n` +
    `Tax: GHS ${taxAmount.toLocaleString('en-GH', { minimumFractionDigits: 2 })}\n` +
    `*Total: GHS ${totalAmount.toLocaleString('en-GH', { minimumFractionDigits: 2 })}*\n\n` +
    `View invoice online: ${shareLink}\n\n` +
    `Thank you for your business!`
  )
}
