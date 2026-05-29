// ════════════════════════════════════════════════════════════════════
// ${APP_NAME} — Payslip PDF Generator
// ════════════════════════════════════════════════════════════════════
//
// Generates a professional portrait A4 payslip document for a payroll
// record. Includes company header, employee info, earnings/deductions
// breakdown, net pay (large bold), employer contributions, and
// disclaimer footer.
// ────────────────────────────────────────────────────────────────────

import jsPDF from 'jspdf'
import { db } from '@/lib/db'
import { fmtDate } from './pdf-generator'
import { APP_NAME, APP_TAGLINE } from '@/lib/constants'
import { registerFonts, getFontFamily } from './pdf-font'

const FF = getFontFamily()

// ── Brand Colors ──
const C = {
  amber: [217, 119, 6] as [number, number, number],
  dark: [28, 25, 23] as [number, number, number],
  gray: [120, 113, 108] as [number, number, number],
  light: [255, 251, 235] as [number, number, number],
  border: [214, 211, 209] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],     // green-600
  red: [220, 38, 38] as [number, number, number],       // red-600
}

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/** Format a number as ₵ currency string */
function ghs(amount: number): string {
  return `₵${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Build a professional payslip PDF for a given payroll record.
 * Portrait A4 format with branded styling.
 */
export async function buildPayslipPdf(payrollId: string): Promise<jsPDF> {
  const payroll = await db.payroll.findUnique({
    where: { id: payrollId },
    include: {
      driver: {
        select: {
          firstName: true,
          lastName: true,
          employeeId: true,
          phone: true,
          email: true,
          licenseNumber: true,
          hireDate: true,
          status: true,
        },
      },
    },
  })

  if (!payroll) {
    throw new Error(`Payroll record not found: ${payrollId}`)
  }

  const driver = payroll.driver
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' })
  registerFonts(doc)
  const pw = 210
  const margin = 15
  const contentW = pw - margin * 2
  let y = 0

  // ════════════════════════════════════════════════════════════
  // 1. HEADER
  // ════════════════════════════════════════════════════════════
  doc.setFillColor(...C.amber)
  doc.rect(0, 0, pw, 20, 'F')

  doc.setFont(FF, 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...C.white)
  doc.text(APP_NAME, margin, 13)

  doc.setFont(FF, 'normal')
  doc.setFontSize(8)
  doc.text(APP_TAGLINE, pw - margin, 8, { align: 'right' })
  doc.text('37 Ring Road Central, Accra, Ghana', pw - margin, 13, { align: 'right' })
  doc.text('+233 30 277 8899', pw - margin, 18, { align: 'right' })

  y = 25

  // ════════════════════════════════════════════════════════════
  // 2. PAYSLIP TITLE
  // ════════════════════════════════════════════════════════════
  doc.setFont(FF, 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...C.amber)
  doc.text('PAYSLIP', margin, y)
  y += 6

  doc.setFont(FF, 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...C.dark)
  doc.text(`Pay Period: ${MONTH_NAMES[payroll.month]} ${payroll.year}`, margin, y)
  doc.text(`Status: ${payroll.status.toUpperCase()}`, pw - margin, y, { align: 'right' })
  y += 2

  doc.setDrawColor(...C.amber)
  doc.setLineWidth(0.8)
  doc.line(margin, y, pw - margin, y)
  y += 6

  // ════════════════════════════════════════════════════════════
  // 3. EMPLOYEE INFORMATION
  // ════════════════════════════════════════════════════════════
  doc.setFillColor(...C.light)
  doc.roundedRect(margin, y, contentW, 24, 2, 2, 'F')

  doc.setFont(FF, 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...C.amber)
  doc.text('EMPLOYEE INFORMATION', margin + 4, y + 5)

  const empInfo = [
    { label: 'Employee Name', value: `${driver.firstName} ${driver.lastName}` },
    { label: 'Employee ID', value: driver.employeeId },
    { label: 'License No.', value: driver.licenseNumber },
    { label: 'Phone', value: driver.phone },
    { label: 'Email', value: driver.email || 'N/A' },
    { label: 'Status', value: driver.status.replace(/\b\w/g, (c: string) => c.toUpperCase()) },
    { label: 'Hire Date', value: fmtDate(driver.hireDate) },
  ]

  // Two-column layout for employee info
  empInfo.forEach((info, idx) => {
    const col = idx < 4 ? 0 : 1
    const row = idx < 4 ? idx : idx - 4
    const ix = margin + 4 + col * (contentW / 2)
    const iy = y + 10 + row * 3.5

    doc.setFont(FF, 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...C.gray)
    doc.text(`${info.label}:`, ix, iy)

    doc.setFont(FF, 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...C.dark)
    doc.text(info.value, ix + 22, iy)
  })

  y += 28

  // ════════════════════════════════════════════════════════════
  // 4. EARNINGS & DEDUCTIONS (side by side)
  // ════════════════════════════════════════════════════════════
  doc.setFont(FF, 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...C.amber)
  doc.text('EARNINGS & DEDUCTIONS', margin, y)
  y += 4

  const colW = (contentW - 6) / 2

  // ── Earnings Section (Left) ──
  doc.setFillColor(245, 245, 244)
  doc.roundedRect(margin, y, colW, 44, 2, 2, 'F')

  // Earnings header
  doc.setFillColor(...C.amber)
  doc.roundedRect(margin, y, colW, 6, 2, 2, 'F')
  // Fix bottom corners of header
  doc.setFillColor(245, 245, 244)
  doc.rect(margin, y + 4, colW, 2, 'F')

  doc.setFont(FF, 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...C.white)
  doc.text('EARNINGS', margin + 4, y + 4.5)

  // Compute breakdowns
  const grossEarnings = payroll.baseSalary + payroll.tripBonus + payroll.overtimePay
  const taxAmount = payroll.baseSalary * 0.15 // 15% income tax
  const ssnitAmount = payroll.baseSalary * 0.13 // 13% SSNIT
  const otherDeductions = Math.max(0, payroll.deductions - taxAmount - ssnitAmount)

  const earnings = [
    { label: 'Base Salary', amount: payroll.baseSalary },
    { label: 'Trip Bonus', amount: payroll.tripBonus },
    { label: 'Overtime Pay', amount: payroll.overtimePay },
  ]

  let ey = y + 12
  earnings.forEach((item) => {
    doc.setFont(FF, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...C.dark)
    doc.text(item.label, margin + 4, ey)

    doc.setFont(FF, 'normal')
    doc.setFontSize(8)
    doc.text(ghs(item.amount), margin + colW - 4, ey, { align: 'right' })
    ey += 6
  })

  // Total Earnings
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.2)
  doc.line(margin + 4, ey, margin + colW - 4, ey)
  ey += 5

  doc.setFont(FF, 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...C.dark)
  doc.text('Total Earnings', margin + 4, ey)
  doc.setTextColor(...C.green)
  doc.text(ghs(grossEarnings), margin + colW - 4, ey, { align: 'right' })

  // ── Deductions Section (Right) ──
  const dedX = margin + colW + 6

  doc.setFillColor(245, 245, 244)
  doc.roundedRect(dedX, y, colW, 44, 2, 2, 'F')

  // Deductions header
  doc.setFillColor(220, 38, 38) // red
  doc.roundedRect(dedX, y, colW, 6, 2, 2, 'F')
  doc.setFillColor(245, 245, 244)
  doc.rect(dedX, y + 4, colW, 2, 'F')

  doc.setFont(FF, 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...C.white)
  doc.text('DEDUCTIONS', dedX + 4, y + 4.5)

  const deductions = [
    { label: 'Income Tax (15%)', amount: taxAmount },
    { label: 'SSNIT (13%)', amount: ssnitAmount },
    { label: 'Advances / Other', amount: otherDeductions },
  ]

  let dy = y + 12
  deductions.forEach((item) => {
    doc.setFont(FF, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...C.dark)
    doc.text(item.label, dedX + 4, dy)

    doc.setFont(FF, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...C.red)
    doc.text(`- ${ghs(item.amount)}`, dedX + colW - 4, dy, { align: 'right' })
    dy += 6
  })

  // Total Deductions
  doc.setDrawColor(...C.border)
  doc.line(dedX + 4, dy, dedX + colW - 4, dy)
  dy += 5

  doc.setFont(FF, 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...C.dark)
  doc.text('Total Deductions', dedX + 4, dy)
  doc.setTextColor(...C.red)
  doc.text(ghs(payroll.deductions), dedX + colW - 4, dy, { align: 'right' })

  y += 48

  // ════════════════════════════════════════════════════════════
  // 5. NET PAY (Prominent)
  // ════════════════════════════════════════════════════════════
  doc.setFillColor(28, 25, 23) // dark background
  doc.roundedRect(margin, y, contentW, 18, 2, 2, 'F')

  // Amber left accent
  doc.setFillColor(...C.amber)
  doc.rect(margin, y, 3, 18, 'F')

  doc.setFont(FF, 'bold')
  doc.setFontSize(10)
  doc.setTextColor(168, 162, 158) // stone-400
  doc.text('NET PAY', margin + 8, y + 8)

  doc.setFont(FF, 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...C.amber)
  doc.text(ghs(payroll.netPay), margin + 8, y + 15)

  // Pay date on the right
  doc.setFont(FF, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(168, 162, 158)
  if (payroll.paidAt) {
    doc.text(`Paid: ${fmtDate(payroll.paidAt)}`, pw - margin - 4, y + 8, { align: 'right' })
  }
  if (payroll.approvedBy) {
    doc.text(`Approved By: ${payroll.approvedBy}`, pw - margin - 4, y + 13, { align: 'right' })
  }

  y += 22

  // ════════════════════════════════════════════════════════════
  // 6. EMPLOYER CONTRIBUTIONS
  // ════════════════════════════════════════════════════════════
  doc.setFont(FF, 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...C.amber)
  doc.text('EMPLOYER CONTRIBUTIONS', margin, y)
  y += 4

  doc.setFillColor(245, 245, 244)
  doc.roundedRect(margin, y, contentW, 18, 2, 2, 'F')

  const employerSSNIT = payroll.baseSalary * 0.13 // 13% employer SSNIT contribution
  const employerContributions = [
    { label: 'SSNIT Employer Contribution (13%)', value: ghs(employerSSNIT) },
    { label: 'Total Employer Cost', value: ghs(grossEarnings + employerSSNIT) },
  ]

  let cy = y + 5
  employerContributions.forEach((item) => {
    doc.setFont(FF, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...C.dark)
    doc.text(item.label, margin + 4, cy)

    doc.setFont(FF, 'bold')
    doc.text(item.value, pw - margin - 4, cy, { align: 'right' })
    cy += 6
  })

  y += 22

  // ════════════════════════════════════════════════════════════
  // 7. NOTES (if any)
  // ════════════════════════════════════════════════════════════
  if (payroll.notes) {
    doc.setFont(FF, 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...C.amber)
    doc.text('NOTES', margin, y)
    y += 4

    doc.setFillColor(...C.light)
    doc.roundedRect(margin, y, contentW, 12, 2, 2, 'F')

    doc.setFont(FF, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...C.dark)
    const splitNotes = doc.splitTextToSize(payroll.notes, contentW - 10)
    doc.text(splitNotes.slice(0, 3), margin + 5, y + 6)

    y += 16
  }

  // ════════════════════════════════════════════════════════════
  // 8. SIGNATURE LINES
  // ════════════════════════════════════════════════════════════
  if (y > 250) {
    doc.addPage()
    y = 20
  }

  const sigW = (contentW - 20) / 2

  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.3)

  // Employee
  doc.line(margin, y + 15, margin + sigW, y + 15)
  doc.setFont(FF, 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...C.gray)
  doc.text("Employee's Signature", margin, y + 20)
  doc.text('Name / Date', margin, y + 24)

  // Authorizer
  doc.line(margin + sigW + 20, y + 15, pw - margin, y + 15)
  doc.text('Authorizer Signature', margin + sigW + 20, y + 20)
  doc.text('Name / Date', margin + sigW + 20, y + 24)

  // ════════════════════════════════════════════════════════════
  // 9. DISCLAIMER FOOTER
  // ════════════════════════════════════════════════════════════
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    const ph = doc.internal.pageSize.getHeight()

    doc.setDrawColor(...C.border)
    doc.setLineWidth(0.3)
    doc.line(margin, ph - 25, pw - margin, ph - 25)

    doc.setFont(FF, 'normal')
    doc.setFontSize(6)
    doc.setTextColor(...C.gray)

    const disclaimer = 'This payslip is a computer-generated document. It does not require a physical signature to be valid. ' +
      'For questions regarding this payslip, please contact the HR Department at hr@fleetpro.com.gh or call +233 30 277 8899. ' +
      'This document is confidential and intended solely for the named employee.'

    const splitDisclaimer = doc.splitTextToSize(disclaimer, contentW)
    doc.text(splitDisclaimer, margin, ph - 20)

    doc.setFontSize(7)
    doc.text(
      `Payslip ${MONTH_NAMES[payroll.month]} ${payroll.year} | ${driver.employeeId} | ${APP_NAME} \u2014 Confidential`,
      margin,
      ph - 10,
    )
    doc.text(`Page ${i} of ${pageCount}`, pw - margin, ph - 10, { align: 'right' })
  }

  return doc
}
