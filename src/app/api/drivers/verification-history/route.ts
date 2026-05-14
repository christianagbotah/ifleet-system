import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const driverId = searchParams.get('driverId')

    if (!driverId) {
      return NextResponse.json(
        { error: 'driverId is required' },
        { status: 400 }
      )
    }

    const history = await db.verificationHistory.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        previousStatus: true,
        newStatus: true,
        verifiedBy: true,
        verifierName: true,
        notes: true,
        documentStatus: true,
        ocrExtracted: true,
        createdAt: true,
      },
    })

    // Parse JSON strings for documentStatus and ocrExtracted
    const parsedHistory = history.map((record) => ({
      ...record,
      documentStatus: record.documentStatus
        ? JSON.parse(record.documentStatus)
        : null,
      ocrExtracted: record.ocrExtracted
        ? JSON.parse(record.ocrExtracted)
        : null,
    }))

    return NextResponse.json(parsedHistory)
  } catch (error) {
    console.error('Verification history error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch verification history' },
      { status: 500 }
    )
  }
}
