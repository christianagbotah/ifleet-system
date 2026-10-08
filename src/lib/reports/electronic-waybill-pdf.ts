import jsPDF from 'jspdf'

import { APP_COMPANY, APP_NAME } from '@/lib/constants'
import { db } from '@/lib/db'
import { storedElectronicWaybillToDomain } from '@/lib/domain/waybills/storage'
import { buildWaybillPdf } from '@/lib/reports/waybill-pdf'

const AMBER: [number, number, number] = [217, 119, 6]
const DARK: [number, number, number] = [28, 25, 23]
const MUTED: [number, number, number] = [120, 113, 108]
const LIGHT: [number, number, number] = [255, 251, 235]

function text(doc: jsPDF, label: string, value: string, x: number, y: number, width = 82) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...MUTED)
  doc.text(label.toUpperCase(), x, y)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...DARK)
  doc.text(doc.splitTextToSize(value || '—', width), x, y + 5)
}

/**
 * Finalized haulage waybills render from the immutable ElectronicWaybill
 * snapshot. Legacy trips without a finalized electronic waybill retain the
 * established PDF renderer for backward compatibility.
 */
export async function buildElectronicWaybillPdf(tripId: string): Promise<jsPDF> {
  const electronicWaybill = await db.electronicWaybill.findUnique({
    where: { tripId },
    include: { versions: { orderBy: { version: 'desc' } } },
  })
  if (!electronicWaybill) return buildWaybillPdf(tripId)

  const finalized = storedElectronicWaybillToDomain(electronicWaybill)
  const snapshot = finalized.snapshot
  const verificationToken = finalized.verificationToken
  const verificationPath = `/verify/waybill/${verificationToken}`

  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - margin * 2

  doc.setFillColor(...AMBER)
  doc.rect(0, 0, pageWidth, 24, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(255, 255, 255)
  doc.text(APP_NAME, margin, 10)
  doc.setFontSize(8)
  doc.text(APP_COMPANY, margin, 16)
  doc.text('Electronic Haulage Waybill', pageWidth - margin, 13, { align: 'right' })

  let y = 34
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...DARK)
  doc.text('E-WAYBILL', margin, y)
  doc.setFontSize(10)
  doc.setTextColor(...AMBER)
  doc.text(finalized.waybillNumber, pageWidth - margin, y, { align: 'right' })
  y += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(`Version ${finalized.version} · Finalized ${new Date(finalized.finalizedAt).toLocaleString('en-GH')}`, margin, y)
  if (finalized.correctionReason) {
    doc.text(`Correction: ${finalized.correctionReason}`, pageWidth - margin, y, { align: 'right', maxWidth: 85 })
  }
  y += 8

  doc.setFillColor(...LIGHT)
  doc.roundedRect(margin, y, contentWidth, 30, 2, 2, 'F')
  text(doc, 'Origin', snapshot.origin, margin + 5, y + 7, 72)
  text(doc, 'Destination', snapshot.destination, pageWidth / 2 + 4, y + 7, 72)
  y += 36

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...AMBER)
  doc.text('CARGO', margin, y)
  y += 4
  doc.setDrawColor(225, 225, 225)
  doc.roundedRect(margin, y, contentWidth, 34, 2, 2)
  text(doc, 'Product', snapshot.product, margin + 5, y + 7, 72)
  text(doc, 'Quantity', `${snapshot.quantity.toLocaleString()} ${snapshot.unit}`, pageWidth / 2 + 4, y + 7, 72)
  text(doc, 'Trip', snapshot.tripNumber, margin + 5, y + 21, 72)
  text(doc, 'Customer', snapshot.customerName || '—', pageWidth / 2 + 4, y + 21, 72)
  y += 42

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...AMBER)
  doc.text('VEHICLE & DRIVER', margin, y)
  y += 4
  doc.setFillColor(248, 248, 248)
  doc.roundedRect(margin, y, contentWidth, 42, 2, 2, 'F')
  text(doc, 'Tractor', snapshot.tractorPlate, margin + 5, y + 7, 72)
  text(doc, 'Trailer', snapshot.trailerPlate || 'Rigid / none', pageWidth / 2 + 4, y + 7, 72)
  text(doc, 'Driver', snapshot.driverName, margin + 5, y + 22, 72)
  text(doc, 'Driver phone', snapshot.driverPhone || '—', pageWidth / 2 + 4, y + 22, 72)
  y += 50

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...AMBER)
  doc.text('VERIFIED WEIGHTS', margin, y)
  y += 4
  const boxWidth = (contentWidth - 8) / 3
  const weights = [
    ['Tare', snapshot.tareWeightKg],
    ['Gross', snapshot.grossWeightKg],
    ['Net', snapshot.netWeightKg],
  ] as const
  weights.forEach(([label, value], index) => {
    const x = margin + index * (boxWidth + 4)
    doc.setFillColor(...LIGHT)
    doc.roundedRect(x, y, boxWidth, 22, 2, 2, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...MUTED)
    doc.text(label.toUpperCase(), x + 4, y + 7)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...DARK)
    doc.text(`${value.toLocaleString()} kg`, x + 4, y + 15)
  })
  y += 30

  if (snapshot.seals.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...AMBER)
    doc.text('CARGO SEALS', margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...DARK)
    doc.text(snapshot.seals.map((seal) => `${seal.sealNumber}${seal.type ? ` (${seal.type})` : ''}`).join(' · '), margin, y, { maxWidth: contentWidth })
    y += 10
  }

  doc.setFillColor(245, 245, 244)
  doc.roundedRect(margin, Math.min(y + 2, 242), contentWidth, 30, 2, 2, 'F')
  const verifyY = Math.min(y + 2, 242)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...DARK)
  doc.text('PUBLIC VERIFICATION', margin + 5, verifyY + 7)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...MUTED)
  doc.text(`Verify: ${verificationPath}`, margin + 5, verifyY + 14)
  doc.text(`Token: ${verificationToken}`, margin + 5, verifyY + 20, { maxWidth: contentWidth - 10 })
  doc.text(`Fingerprint: ${finalized.contentHash}`, margin + 5, verifyY + 26, { maxWidth: contentWidth - 10 })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(...MUTED)
  doc.text(
    `Immutable electronic waybill · v${finalized.version} · Weighing ${snapshot.weighingEventId}`,
    pageWidth / 2,
    pageHeight - 8,
    { align: 'center' },
  )

  return doc
}
