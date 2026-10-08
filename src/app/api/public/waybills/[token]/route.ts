import { NextRequest, NextResponse } from 'next/server'

import { db } from '@/lib/db'
import {
  publicWaybillVerification,
  type FinalizedWaybill,
  type WaybillSnapshot,
} from '@/lib/domain/waybills/electronic-waybill'

function asFinalizedWaybill(root: {
  waybillNumber: string
  verificationToken: string
  currentVersion: number
  status: string
}, version: {
  version: number
  supersedesVersion: number | null
  snapshot: string
  contentHash: string
  finalizedBy: string
  finalizedAt: Date
  correctionReason: string | null
}): FinalizedWaybill {
  const snapshot = JSON.parse(version.snapshot) as WaybillSnapshot
  return {
    waybillNumber: root.waybillNumber,
    verificationToken: root.verificationToken,
    version: version.version,
    supersedesVersion: version.supersedesVersion,
    status: 'finalized',
    snapshot: Object.freeze(snapshot),
    contentHash: version.contentHash,
    finalizedBy: version.finalizedBy,
    finalizedAt: version.finalizedAt.toISOString(),
    correctionReason: version.correctionReason,
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const verificationToken = token.trim()
    if (!verificationToken) return NextResponse.json({ valid: false }, { status: 404 })

    const root = await db.electronicWaybill.findUnique({ where: { verificationToken } })
    if (!root || root.status !== 'finalized') return NextResponse.json({ valid: false }, { status: 404 })

    const version = await db.electronicWaybillVersion.findUnique({
      where: { waybillId_version: { waybillId: root.id, version: root.currentVersion } },
    })
    if (!version) return NextResponse.json({ valid: false }, { status: 404 })

    const waybill = publicWaybillVerification(asFinalizedWaybill(root, version))
    return NextResponse.json({ valid: true, waybill }, {
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    console.error('Public waybill verification error:', error)
    return NextResponse.json({ valid: false }, { status: 500 })
  }
}
