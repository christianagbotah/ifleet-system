import { NextRequest, NextResponse } from 'next/server'

import { requireAuth, ROLES } from '@/lib/auth-server'
import { db } from '@/lib/db'
import {
  buildHaulageReport,
  HAULAGE_REPORT_FAMILIES,
  toHaulageExportTable,
  type HaulageReportFamily,
  type HaulageReportFilters,
} from '@/lib/domain/reports/haulage-reports'
import { buildCsv } from '@/lib/reports/csv-generator'
import { fetchHaulageReportFacts } from '@/lib/reports/haulage-report-data'

const FORMATS = ['csv', 'xlsx', 'pdf'] as const
type Format = (typeof FORMATS)[number]
type ExportCell = string | number | boolean | null | undefined

function safeFilters(value: unknown): HaulageReportFilters {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const text = (key: string) => typeof raw[key] === 'string' && String(raw[key]).trim()
    ? String(raw[key]).trim()
    : undefined
  return {
    dateFrom: text('dateFrom'), dateTo: text('dateTo'), shipperId: text('shipperId'),
    transporterId: text('transporterId'), vehicleId: text('vehicleId'),
    driverId: text('driverId'), route: text('route'),
  }
}

function title(family: string) {
  return family.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function rowsWithTotals(headers: string[], rows: ExportCell[][], totals: Record<string, number>) {
  if (Object.keys(totals).length === 0) return rows
  return [...rows, headers.map((header, index) => index === 0 ? 'TOTAL' : totals[header] ?? null)]
}

async function buildXlsx(headers: string[], rows: ExportCell[][]) {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'iFleetPro'
  const sheet = workbook.addWorksheet('Haulage Report')
  sheet.addRow(headers)
  for (const row of rows) sheet.addRow(row.map((value) => value ?? ''))
  sheet.getRow(1).font = { bold: true }
  headers.forEach((header, index) => {
    sheet.getColumn(index + 1).width = Math.max(12, Math.min(32, header.length + 4))
  })
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

async function buildPdf(reportTitle: string, headers: string[], rows: ExportCell[][]) {
  const jsPDF = (await import('jspdf')).default
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.setFontSize(16)
  doc.text(reportTitle, 14, 18)
  doc.setFontSize(8)
  doc.text(`Generated ${new Date().toISOString()}`, 14, 24)
  autoTable(doc, {
    startY: 29,
    head: [headers],
    body: rows.map((row) => row.map((value) => value ?? '')),
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [40, 40, 40] },
  })
  return Buffer.from(doc.output('arraybuffer'))
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  let family = 'unknown'
  let format = 'unknown'
  let filters: HaulageReportFilters = {}

  try {
    const body = await request.json() as { family?: string; format?: string; filters?: unknown }
    family = body.family ?? 'unknown'
    format = body.format ?? 'unknown'
    if (!HAULAGE_REPORT_FAMILIES.includes(family as HaulageReportFamily)) {
      return NextResponse.json({ error: 'Invalid haulage report family.' }, { status: 400 })
    }
    if (!FORMATS.includes(format as Format)) {
      return NextResponse.json({ error: 'Format must be csv, xlsx, or pdf.' }, { status: 400 })
    }

    filters = safeFilters(body.filters)
    if (auth.roleName === ROLES.DRIVER) {
      if (!auth.driverId) return NextResponse.json({ error: 'Driver profile is not linked.' }, { status: 403 })
      filters.driverId = auth.driverId
    }

    const typedFamily = family as HaulageReportFamily
    const facts = await fetchHaulageReportFacts(typedFamily, filters)
    const report = buildHaulageReport({
      family: typedFamily,
      facts,
      filters,
      canViewFinancials: auth.roleName === ROLES.ADMIN || auth.roleName === ROLES.MANAGER,
    })
    const table = toHaulageExportTable(report)
    const rows = rowsWithTotals(table.headers, table.rows, table.totals)

    let content: string | Buffer
    let contentType: string
    if (format === 'csv') {
      content = buildCsv(table.headers, rows)
      contentType = 'text/csv'
    } else if (format === 'xlsx') {
      content = await buildXlsx(table.headers, rows)
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    } else {
      content = await buildPdf(`${title(family)} Report`, table.headers, rows)
      contentType = 'application/pdf'
    }

    const fileSize = typeof content === 'string' ? Buffer.byteLength(content) : content.length
    await db.reportHistory.create({
      data: {
        type: `haulage_${family}`,
        title: `${title(family)} Report`,
        format,
        parameters: JSON.stringify(filters),
        generatedBy: auth.email,
        fileSize,
        status: 'completed',
      },
    })

    return new NextResponse(content, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="ifleetpro-${family}-${new Date().toISOString().slice(0, 10)}.${format}"`,
        'Content-Length': String(fileSize),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown report error'
    try {
      await db.reportHistory.create({
        data: {
          type: `haulage_${family}`,
          title: `Failed: ${title(family)}`,
          format,
          parameters: JSON.stringify(filters),
          generatedBy: auth.email,
          status: 'failed',
          error: message,
        },
      })
    } catch {
      // History persistence must not hide the original export failure.
    }
    console.error('[Haulage Reports] Export failed:', message)
    return NextResponse.json({ error: `Report export failed: ${message}` }, { status: 500 })
  }
}
