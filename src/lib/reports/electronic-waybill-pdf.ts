import type jsPDF from 'jspdf'

import { db } from '@/lib/db'
import { storedElectronicWaybillToDomain } from '@/lib/domain/waybills/storage'
import { buildWaybillPdf } from '@/lib/reports/waybill-pdf'

/**
 * Reuses the mature legacy layout but makes the finalized ElectronicWaybill
 * identity authoritative and adds a public verification reference to every page.
 */
export async function buildElectronicWaybillPdf(tripId: string): Promise<jsPDF> {
  const doc = await buildWaybillPdf(tripId)
  const electronicWaybill = await db.electronicWaybill.findUnique({
    where: { tripId },
    include: { versions: { orderBy: { version: 'desc' } } },
  })

  if (!electronicWaybill) return doc

  const finalized = storedElectronicWaybillToDomain(electronicWaybill)
  const verificationToken = finalized.verificationToken
  const pageCount = doc.getNumberOfPages()

  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page)
    const pageHeight = doc.internal.pageSize.getHeight()
    doc.setFontSize(6)
    doc.setTextColor(120, 113, 108)
    doc.text(
      `Electronic ${finalized.waybillNumber} · v${finalized.version} · Verify: /verify/waybill/${verificationToken}`,
      15,
      pageHeight - 4,
    )
  }

  return doc
}
