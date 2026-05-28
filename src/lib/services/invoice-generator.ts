// ════════════════════════════════════════════════════════════════════
// ${APP_NAME} — Invoice Generator Service
// ════════════════════════════════════════════════════════════════════
//
// Automatically generates invoices from trip data:
//   - Generates invoice number in INV-YYYYMMDD-XXXX format
//   - Creates or reuses a Client record
//   - Builds line items from TripItem[] and TripDeliveryDestination[]
//   - Calculates subtotal, tax, and total
//   - Links invoice to the trip via tripId
//
// Usage:
//   const invoice = await generateInvoiceForTrip(tripId, userId)
// ────────────────────────────────────────────────────────────────────

import { db } from '@/lib/db'

// ── Types ──

interface GeneratedInvoice {
  id: string
  invoiceNumber: string
  clientId: string
  tripId: string
  issueDate: Date
  dueDate: Date
  status: string
  subtotal: number
  taxAmount: number
  taxRate: number
  totalAmount: number
  InvoiceItem: Array<{
    id: string
    description: string
    quantity: number
    unitPrice: number
    total: number
    order: number
  }>
}

// ── Constants ──

/** Default payment terms in days */
const DEFAULT_PAYMENT_TERMS_DAYS = 30

/** Default VAT/tax rate (%) */
const DEFAULT_TAX_RATE = 0

// ════════════════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════════════════

/**
 * Generate an invoice for a trip.
 *
 * Fetches the trip with all related data, resolves the client,
 * builds line items from trip items and/or delivery destinations,
 * calculates totals, and persists the invoice + items.
 *
 * @param tripId  The trip to generate an invoice for
 * @param userId  The user who triggered the generation (for audit purposes)
 * @returns The created invoice with items, or null if generation was skipped
 */
export async function generateInvoiceForTrip(
  tripId: string,
  _userId: string
): Promise<GeneratedInvoice | null> {
  try {
    // ── 1. Fetch trip with all relations ──
    const trip = await db.trip.findUnique({
      where: { id: tripId },
      include: {
        client: { select: { id: true, companyName: true, contactPerson: true, phone: true, email: true } },
        TripItem: {
          include: {
            item: { select: { name: true, unit: true } },
            loadingPoint: { select: { name: true } },
            supplier: { select: { name: true } },
            tripDeliveryDestination: {
              select: {
                id: true,
                customerName: true,
                destinationZone: { select: { name: true, destinationCity: { select: { name: true } } } },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        TripDeliveryDestination: {
          include: {
            client: { select: { id: true, companyName: true } },
            destinationZone: { select: { name: true, destinationCity: { select: { name: true } } } },
            TripItem: {
              include: {
                item: { select: { name: true, unit: true } },
              },
            },
          },
          orderBy: { stopOrder: 'asc' },
        },
        driver: { select: { firstName: true, lastName: true } },
        truck: { select: { plateNumber: true, make: true, model: true } },
      },
    })

    if (!trip) {
      console.warn(`[InvoiceGenerator] Trip ${tripId} not found`)
      return null
    }

    // ── 2. Check if an invoice already exists for this trip ──
    const existingInvoice = await db.invoice.findUnique({
      where: { tripId },
    })
    if (existingInvoice) {
      console.log(`[InvoiceGenerator] Invoice ${existingInvoice.invoiceNumber} already exists for trip ${trip.tripNumber}. Skipping.`)
      return null
    }

    // ── 3. Resolve or create client ──
    const clientName = trip.client?.companyName || trip.customerName
    if (!clientName) {
      console.warn(`[InvoiceGenerator] Trip ${trip.tripNumber} has no client or customerName. Skipping invoice generation.`)
      return null
    }

    let clientId = trip.clientId
    if (!clientId) {
      // Create a basic client from customerName
      const newClient = await db.client.create({
        data: {
          companyName: clientName,
          contactPerson: clientName,
          phone: trip.customerPhone || 'N/A',
        },
      })
      clientId = newClient.id

      // Link client to trip for future reference
      await db.trip.update({
        where: { id: tripId },
        data: { clientId },
      }).catch(() => {
        // Non-critical: linking failure shouldn't block invoice generation
        console.warn(`[InvoiceGenerator] Could not link client ${clientId} to trip ${trip.tripNumber}`)
      })

      console.log(`[InvoiceGenerator] Created new client "${clientName}" (${clientId}) for trip ${trip.tripNumber}`)
    }

    // ── 4. Build line items ──
    const invoiceItems = buildInvoiceLineItems(trip)

    if (invoiceItems.length === 0) {
      // Fall back to a single line item from trip-level fields
      const revenue = trip.totalRevenue || 0
      if (revenue <= 0) {
        console.warn(`[InvoiceGenerator] Trip ${trip.tripNumber} has no items and no revenue. Skipping invoice generation.`)
        return null
      }

      const qty = trip.quantity || 1
      const unitPrice = qty > 0 ? revenue / qty : revenue
      invoiceItems.push({
        description: `Transport: ${trip.itemName || 'Goods'} — ${trip.loadingLocation} to ${trip.destination}`,
        quantity: qty,
        unitPrice: Math.round(unitPrice * 100) / 100,
        total: Math.round(revenue * 100) / 100,
        order: 0,
      })
    }

    // ── 5. Fetch system settings for tax rate and payment terms ──
    let taxRate = DEFAULT_TAX_RATE
    let paymentTermsDays = DEFAULT_PAYMENT_TERMS_DAYS
    try {
      const settings = await db.systemSettings.findFirst()
      // SystemSettings doesn't have taxRate/paymentTerms fields, so we use defaults
      // In the future, these could be added to SystemSettings
      if (settings) {
        // Placeholder for future settings integration
        void settings
      }
    } catch {
      // Use defaults if settings can't be fetched
    }

    // ── 6. Calculate totals ──
    const subtotal = invoiceItems.reduce((sum, item) => sum + item.total, 0)
    const taxAmount = Math.round((subtotal * taxRate) / 100 * 100) / 100
    const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100

    // ── 7. Generate invoice number ──
    const invoiceNumber = await generateInvoiceNumber()

    // ── 8. Calculate dates ──
    const issueDate = new Date()
    const dueDate = new Date(issueDate)
    dueDate.setDate(dueDate.getDate() + paymentTermsDays)

    // ── 9. Create invoice + items in a transaction ──
    const invoice = await db.invoice.create({
      data: {
        invoiceNumber,
        clientId,
        tripId,
        issueDate,
        dueDate,
        status: 'sent', // Trip is confirmed, so invoice is sent
        subtotal: Math.round(subtotal * 100) / 100,
        taxAmount,
        taxRate,
        totalAmount,
        notes: `Auto-generated for trip ${trip.tripNumber}. Driver: ${trip.driver.firstName} ${trip.driver.lastName}. Truck: ${trip.truck.plateNumber}.`,
        terms: `Net ${paymentTermsDays} days. Payment is due within ${paymentTermsDays} days of the invoice date.`,
        InvoiceItem: {
          create: invoiceItems.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.total,
            order: item.order,
          })),
        },
      },
      include: {
        InvoiceItem: { orderBy: { order: 'asc' } },
      },
    })

    console.log(
      `[InvoiceGenerator] Created invoice ${invoice.invoiceNumber} for trip ${trip.tripNumber}. ` +
      `Total: GHS ${invoice.totalAmount.toLocaleString('en-GH', { minimumFractionDigits: 2 })} ` +
      `(${invoiceItems.length} line items)`
    )

    return invoice as GeneratedInvoice
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[InvoiceGenerator] Failed to generate invoice for trip ${tripId}:`, errorMsg)
    return null
  }
}

/**
 * Generate a unique sequential invoice number in format INV-YYYYMMDD-XXXX.
 */
async function generateInvoiceNumber(): Promise<string> {
  const now = new Date()
  const dateStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('')

  const prefix = `INV-${dateStr}-`

  // Find the highest invoice number with today's prefix
  const todayInvoices = await db.invoice.findMany({
    where: { invoiceNumber: { startsWith: prefix } },
    select: { invoiceNumber: true },
    orderBy: { invoiceNumber: 'desc' },
    take: 1,
  })

  let nextSeq = 1
  if (todayInvoices.length > 0) {
    const lastNum = todayInvoices[0].invoiceNumber
    const seqPart = lastNum.slice(prefix.length)
    const lastSeq = parseInt(seqPart, 10)
    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1
    }
  }

  return `${prefix}${String(nextSeq).padStart(4, '0')}`
}

/**
 * Generate a shareable link for viewing an invoice.
 */
export function generateInvoiceShareLink(invoiceId: string): string {
  return `/portal/invoice/${invoiceId}`
}

// ════════════════════════════════════════════════════════════════════
// LINE ITEM BUILDER
// ════════════════════════════════════════════════════════════════════

interface InvoiceLineItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
  order: number
}

/**
 * Build invoice line items from trip data.
 *
 * For SINGLE delivery trips:
 *   - Each TripItem becomes a line item
 *   - Falls back to trip-level item/quantity/revenue
 *
 * For MULTIPLE delivery trips (MULTI delivery type):
 *   - Creates separate line items per delivery destination
 *   - Each destination's items are grouped under that destination
 */
function buildInvoiceLineItems(
  trip: Awaited<ReturnType<typeof db.trip.findUnique>> & {
    TripItem: Array<{
      itemName: string
      unit: string
      quantity: number
      rate: number | null
      total: number | null
      sortOrder: number
      deliveryDestinationId: string | null
      item: { name: string; unit: string } | null
      loadingPoint: { name: string } | null
      supplier: { name: string } | null
      tripDeliveryDestination: {
        id: string
        customerName: string
        destinationZone: { name: string; destinationCity: { name: string } } | null
      } | null
    }>
    TripDeliveryDestination: Array<{
      id: string
      customerName: string
      zoneRate: number | null
      client: { id: string; companyName: string } | null
      destinationZone: { name: string; destinationCity: { name: string } } | null
      TripItem: Array<{
        itemName: string
        unit: string
        quantity: number
        rate: number | null
        total: number | null
        item: { name: string; unit: string } | null
      }>
    }>
  }
): InvoiceLineItem[] {
  const items: InvoiceLineItem[] = []
  let orderIndex = 0

  // Check if this is a multi-delivery trip
  const isMultiDelivery =
    trip.deliveryType === 'MULTI' &&
    trip.TripDeliveryDestination &&
    trip.TripDeliveryDestination.length > 0

  if (isMultiDelivery) {
    // ── Multi-delivery: create line items per destination ──
    for (const dest of trip.TripDeliveryDestination) {
      const destLabel = dest.destinationZone
        ? `${dest.destinationZone.name}, ${dest.destinationZone.destinationCity.name}`
        : dest.customerName || 'Unknown Destination'

      if (dest.TripItem && dest.TripItem.length > 0) {
        // Each item in this destination becomes a line item
        for (const destItem of dest.TripItem) {
          const qty = destItem.quantity || 0
          const unitPrice = destItem.rate || (qty > 0 ? (destItem.total || 0) / qty : 0)
          const itemTotal = destItem.total || (qty * unitPrice)

          if (qty > 0 || itemTotal > 0) {
            items.push({
              description: `${destLabel} — ${destItem.itemName || destItem.item?.name || 'Goods'} (${destItem.unit || 'bags'})`,
              quantity: qty,
              unitPrice: Math.round(unitPrice * 100) / 100,
              total: Math.round(itemTotal * 100) / 100,
              order: orderIndex++,
            })
          }
        }
      } else if (dest.zoneRate) {
        // No items, but has a zone rate
        items.push({
          description: `Transport to ${destLabel}`,
          quantity: 1,
          unitPrice: Math.round(dest.zoneRate * 100) / 100,
          total: Math.round(dest.zoneRate * 100) / 100,
          order: orderIndex++,
        })
      }
    }
  } else {
    // ── Single delivery: use TripItem[] if available ──
    if (trip.TripItem && trip.TripItem.length > 0) {
      for (const ti of trip.TripItem) {
        const qty = ti.quantity || 0
        const unitPrice = ti.rate || (qty > 0 ? (ti.total || 0) / qty : 0)
        const itemTotal = ti.total || (qty * unitPrice)

        if (qty > 0 || itemTotal > 0) {
          const supplierNote = ti.supplier ? ` [${ti.supplier.name}]` : ''
          const lpNote = ti.loadingPoint ? ` from ${ti.loadingPoint.name}` : ''
          items.push({
            description: `${ti.itemName || ti.item?.name || 'Goods'}${supplierNote}${lpNote} (${ti.unit || 'bags'})`,
            quantity: qty,
            unitPrice: Math.round(unitPrice * 100) / 100,
            total: Math.round(itemTotal * 100) / 100,
            order: orderIndex++,
          })
        }
      }
    }
  }

  return items
}
