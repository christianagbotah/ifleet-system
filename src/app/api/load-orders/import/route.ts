import ExcelJS from 'exceljs'
import Papa from 'papaparse'
import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { db } from '@/lib/db'
import {
  importLoadOrders,
  type ExternalRow,
  type LoadOrderImportMapping,
} from '@/lib/domain/integrations/load-order-import'
import { persistImportedLoadOrder } from '@/lib/domain/integrations/load-order-persistence'

const MAX_ROWS = 5000

async function rowsFromWorkbook(file: File): Promise<ExternalRow[]> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) return []
  const headerValues = worksheet.getRow(1).values as unknown[]
  const headers = headerValues.slice(1).map((value) => String(value ?? '').trim())
  const rows: ExternalRow[] = []
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || rows.length >= MAX_ROWS) return
    const values = row.values as unknown[]
    const record: ExternalRow = {}
    headers.forEach((header, index) => {
      if (header) record[header] = values[index + 1] ?? null
    })
    if (Object.values(record).some((value) => value != null && String(value).trim() !== '')) rows.push(record)
  })
  return rows
}

async function parsePayload(request: NextRequest): Promise<{ rows: ExternalRow[]; mapping: LoadOrderImportMapping }> {
  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    const file = form.get('file')
    const mappingRaw = form.get('mapping')
    if (!(file instanceof File)) throw new Error('A CSV or XLSX file is required.')
    if (typeof mappingRaw !== 'string') throw new Error('Import mapping is required.')
    const mapping = JSON.parse(mappingRaw) as LoadOrderImportMapping
    const lowerName = file.name.toLowerCase()
    if (lowerName.endsWith('.csv')) {
      const parsed = Papa.parse<ExternalRow>(await file.text(), { header: true, skipEmptyLines: true })
      if (parsed.errors.length) throw new Error(`CSV parse error: ${parsed.errors[0]?.message || 'invalid CSV'}`)
      return { rows: parsed.data.slice(0, MAX_ROWS), mapping }
    }
    if (lowerName.endsWith('.xlsx')) return { rows: await rowsFromWorkbook(file), mapping }
    throw new Error('Only CSV and XLSX files are supported.')
  }

  const body = (await request.json()) as { rows?: ExternalRow[]; mapping?: LoadOrderImportMapping }
  if (!Array.isArray(body.rows) || !body.mapping) throw new Error('rows and mapping are required.')
  return { rows: body.rows.slice(0, MAX_ROWS), mapping: body.mapping }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { rows, mapping } = await parsePayload(request)
    if (rows.length === 0) return NextResponse.json({ error: 'Import contains no data rows.' }, { status: 400 })
    if (!mapping.defaults?.shipperProfileId || !mapping.defaults?.loadingPointId) {
      return NextResponse.json({ error: 'Mapping requires default shipperProfileId and loadingPointId.' }, { status: 400 })
    }

    const existingOrders = await db.loadOrder.findMany({
      where: { shipperProfileId: mapping.defaults.shipperProfileId, externalReference: { not: null } },
      select: { shipperProfileId: true, externalReference: true },
    })

    const result = await importLoadOrders({
      rows,
      mapping,
      existingOrders,
      persist: (draft) => persistImportedLoadOrder(draft, { createdBy: auth.userId, sourceType: 'file_import' }),
    })

    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'LoadOrderImport',
      entityId: result.batchId,
      details: { acceptedCount: result.acceptedCount, rejectedRowCount: result.rejectedRowCount, rowCount: rows.length },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(result, { status: result.acceptedCount > 0 ? 200 : 422 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
