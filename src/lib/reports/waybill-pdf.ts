// ════════════════════════════════════════════════════════════════════
// ${APP_NAME} — Waybill PDF Generator
// ════════════════════════════════════════════════════════════════════
//
// Generates a professional portrait A4 waybill document for a trip.
// Includes company header, waybill number, shipper/consignee info,
// route details, cargo information, vehicle/driver details,
// special instructions, and signature lines.
// ────────────────────────────────────────────────────────────────────

import jsPDF from 'jspdf'
import { db } from '@/lib/db'
import { fmtDate, fmtDateTime } from './pdf-generator'
import { APP_NAME, APP_COMPANY, APP_TAGLINE } from '@/lib/constants'

// ── Brand Colors ──
const C = {
  amber: [217, 119, 6] as [number, number, number],
  dark: [28, 25, 23] as [number, number, number],
  gray: [120, 113, 108] as [number, number, number],
  light: [255, 251, 235] as [number, number, number],
  border: [214, 211, 209] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  black: [0, 0, 0] as [number, number, number],
}

/**
 * Build a professional waybill PDF for a given trip.
 * Portrait A4 format with branded styling.
 */
export async function buildWaybillPdf(tripId: string): Promise<jsPDF> {
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    include: {
      truck: { select: { plateNumber: true, make: true, model: true } },
      driver: { select: { firstName: true, lastName: true, phone: true, employeeId: true, licenseNumber: true } },
      client: { select: { companyName: true, contactPerson: true, phone: true, address: true, city: true, region: true } },
      deliveryStops: { orderBy: { stopOrder: 'asc' } },
    },
  })

  if (!trip) {
    throw new Error(`Trip not found: ${tripId}`)
  }

  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' })
  const pw = 210 // A4 width
  const margin = 15
  const contentW = pw - margin * 2
  let y = 0

  // ── 1. Header Bar ──
  doc.setFillColor(...C.amber)
  doc.rect(0, 0, pw, 20, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...C.white)
  doc.text(APP_NAME, margin, 13)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(APP_TAGLINE, pw - margin, 8, { align: 'right' })
  doc.text('37 Ring Road Central, Accra, Ghana', pw - margin, 13, { align: 'right' })
  doc.text('+233 30 277 8899', pw - margin, 18, { align: 'right' })

  y = 25

  // ── 2. WAYBILL Title ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...C.amber)
  doc.text('WAYBILL', margin, y)
  y += 7

  // Waybill number and date on same line
  const waybillNum = trip.waybillNumber || `WB-${tripId.slice(-8).toUpperCase()}`
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...C.dark)
  doc.text(`Waybill No: ${waybillNum}`, margin, y)
  doc.text(`Date: ${fmtDate(new Date())}`, pw - margin, y, { align: 'right' })
  y += 2

  // Thin amber line under title
  doc.setDrawColor(...C.amber)
  doc.setLineWidth(0.8)
  doc.line(margin, y, pw - margin, y)
  y += 6

  // ── 3. Shipper (From) Info ──
  doc.setFillColor(...C.light)
  doc.roundedRect(margin, y, contentW, 22, 2, 2, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...C.amber)
  doc.text('SHIPPER (FROM)', margin + 4, y + 5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...C.dark)
  doc.text(APP_COMPANY, margin + 4, y + 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...C.gray)
  doc.text('37 Ring Road Central, Accra, Ghana', margin + 4, y + 16)
  doc.text('+233 30 277 8899 | info@fleetpro.com.gh', margin + 4, y + 20)
  y += 26

  // ── 4. Consignee (Client) Info ──
  doc.setFillColor(245, 245, 244)
  doc.roundedRect(margin, y, contentW, 22, 2, 2, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...C.amber)
  doc.text('CONSIGNEE (TO)', margin + 4, y + 5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...C.dark)
  doc.text(trip.client?.companyName || trip.customerName || 'N/A', margin + 4, y + 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...C.gray)
  const clientContact = trip.client?.contactPerson || 'N/A'
  const clientPhone = trip.client?.phone || trip.customerPhone || 'N/A'
  const clientAddress = trip.client?.address ? `${trip.client.address}${trip.client.city ? `, ${trip.client.city}` : ''}${trip.client.region ? `, ${trip.client.region}` : ''}` : 'N/A'
  doc.text(`Contact: ${clientContact}  |  Phone: ${clientPhone}`, margin + 4, y + 16)
  doc.text(`Address: ${clientAddress}`, margin + 4, y + 20)
  y += 26

  // ── 5. Route Section ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...C.amber)
  doc.text('ROUTE', margin, y)
  y += 4

  // Route box with From → To
  const routeBoxH = 14
  doc.setFillColor(...C.light)
  doc.roundedRect(margin, y, contentW, routeBoxH, 2, 2, 'F')

  // Amber left accent
  doc.setFillColor(...C.amber)
  doc.rect(margin, y, 2, routeBoxH, 'F')

  // From
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...C.gray)
  doc.text('FROM', margin + 6, y + 4)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...C.dark)
  doc.text(trip.loadingLocation, margin + 6, y + 10)

  // Arrow
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...C.amber)
  doc.text('\u2192', pw / 2, y + 10, { align: 'center' })

  // To
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...C.gray)
  doc.text('TO', pw - margin - 50, y + 4)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...C.dark)
  doc.text(trip.destination, pw - margin - 50, y + 10)

  y += routeBoxH + 6

  // ── 6. Cargo Details ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...C.amber)
  doc.text('CARGO DETAILS', margin, y)
  y += 4

  // Cargo table
  doc.setFillColor(...C.light)
  doc.roundedRect(margin, y, contentW, 20, 2, 2, 'F')

  const cargoRows = [
    ['Description', trip.itemName],
    ['Quantity', `${trip.quantity} ${trip.unit}`],
    ['Unit Price', trip.unitPrice ? `₵${trip.unitPrice.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'],
    ['Total Value', trip.totalRevenue ? `₵${trip.totalRevenue.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'],
  ]

  cargoRows.forEach((row, idx) => {
    const ry = y + 5 + idx * 4
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...C.gray)
    doc.text(`${row[0]}:`, margin + 6, ry)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...C.dark)
    doc.text(row[1], margin + 45, ry)
  })

  y += 24

  // ── 7. Vehicle & Driver Info ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...C.amber)
  doc.text('VEHICLE & DRIVER', margin, y)
  y += 4

  // Two column layout: vehicle | driver
  const colW = (contentW - 8) / 2

  // Vehicle card
  doc.setFillColor(245, 245, 244)
  doc.roundedRect(margin, y, colW, 24, 2, 2, 'F')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...C.gray)
  doc.text('VEHICLE', margin + 4, y + 5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...C.dark)
  doc.text(`${trip.truck.plateNumber}`, margin + 4, y + 11)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...C.gray)
  doc.text(`${trip.truck.make} ${trip.truck.model}`, margin + 4, y + 16)
  doc.text(`Fuel: ${trip.truck.fuelType}`, margin + 4, y + 21)

  // Driver card
  doc.setFillColor(245, 245, 244)
  doc.roundedRect(margin + colW + 8, y, colW, 24, 2, 2, 'F')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...C.gray)
  doc.text('DRIVER', margin + colW + 12, y + 5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...C.dark)
  doc.text(`${trip.driver.firstName} ${trip.driver.lastName}`, margin + colW + 12, y + 11)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...C.gray)
  doc.text(`ID: ${trip.driver.employeeId}`, margin + colW + 12, y + 16)
  doc.text(`Phone: ${trip.driver.phone}  |  License: ${trip.driver.licenseNumber}`, margin + colW + 12, y + 21)

  y += 28

  // ── 8. Trip Reference Info ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...C.amber)
  doc.text('TRIP INFORMATION', margin, y)
  y += 4

  doc.setFillColor(...C.light)
  doc.roundedRect(margin, y, contentW, 16, 2, 2, 'F')

  const tripInfo = [
    `Trip #: ${trip.tripNumber}`,
    `Order #: ${trip.orderNumber || '-'}`,
    `Departure: ${fmtDateTime(trip.departureTime)}`,
    `Customer Ref: ${trip.customerRef || '-'}`,
  ]

  tripInfo.forEach((info, idx) => {
    const iy = y + 5 + idx * 3.5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...C.dark)
    doc.text(info, margin + 5, iy)
  })

  y += 20

  // ── 9. Special Instructions / Notes ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...C.amber)
  doc.text('SPECIAL INSTRUCTIONS / NOTES', margin, y)
  y += 4

  doc.setFillColor(245, 245, 244)
  doc.roundedRect(margin, y, contentW, 14, 2, 2, 'F')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...C.dark)
  const notes = trip.notes || 'No special instructions.'
  const splitNotes = doc.splitTextToSize(notes, contentW - 10)
  doc.text(splitNotes.slice(0, 3), margin + 5, y + 6)

  y += 18

  // ── 10. Delivery Stops (if any) ──
  if (trip.deliveryStops.length > 0) {
    if (y > 240) {
      doc.addPage()
      y = 20
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...C.amber)
    doc.text('DELIVERY STOPS', margin, y)
    y += 4

    doc.setFillColor(...C.light)
    doc.roundedRect(margin, y, contentW, 6 + trip.deliveryStops.length * 6, 2, 2, 'F')

    // Header
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...C.gray)
    doc.text('Stop', margin + 5, y + 4)
    doc.text('Destination', margin + 18, y + 4)
    doc.text('Customer', margin + 70, y + 4)
    doc.text('Qty', margin + 120, y + 4)
    doc.text('Status', margin + 150, y + 4)

    trip.deliveryStops.forEach((stop, idx) => {
      const sy = y + 10 + idx * 6
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...C.dark)
      doc.text(`#${stop.stopOrder}`, margin + 5, sy)
      doc.text(stop.destination, margin + 18, sy)
      doc.text(stop.customerName || '-', margin + 70, sy)
      doc.text(`${stop.expectedQty} ${stop.unit}`, margin + 120, sy)
      doc.text(stop.status, margin + 150, sy)
    })

    y += 10 + trip.deliveryStops.length * 6 + 6
  }

  // ── 11. Signature Lines ──
  if (y > 250) {
    doc.addPage()
    y = 20
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...C.amber)
  doc.text('AUTHORIZATION', margin, y)
  y += 8

  const sigW = (contentW - 20) / 3

  // Prepared by
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.3)
  doc.line(margin, y + 15, margin + sigW, y + 15)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...C.gray)
  doc.text('Prepared By', margin, y + 20)
  doc.text('Name / Signature / Date', margin, y + 24)

  // Driver
  doc.line(margin + sigW + 10, y + 15, margin + sigW * 2 + 10, y + 15)
  doc.text('Driver', margin + sigW + 10, y + 20)
  doc.text('Name / Signature / Date', margin + sigW + 10, y + 24)

  // Received by
  doc.line(margin + sigW * 2 + 20, y + 15, pw - margin, y + 15)
  doc.text('Received By', margin + sigW * 2 + 20, y + 20)
  doc.text('Name / Signature / Date', margin + sigW * 2 + 20, y + 24)

  // ── 12. Footer ──
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    const ph = doc.internal.pageSize.getHeight()

    doc.setDrawColor(...C.border)
    doc.setLineWidth(0.3)
    doc.line(margin, ph - 15, pw - margin, ph - 15)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...C.gray)
    doc.text(`Waybill ${waybillNum} | ${APP_NAME} \u2014 Confidential`, margin, ph - 10)
    doc.text(`Page ${i} of ${pageCount}`, pw - margin, ph - 10, { align: 'right' })
  }

  return doc
}
