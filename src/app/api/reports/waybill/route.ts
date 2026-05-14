import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { buildWaybillPdf } from '@/lib/reports/waybill-pdf'

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const tripId = searchParams.get('tripId')

  if (!tripId) {
    return NextResponse.json({ error: 'tripId is required' }, { status: 400 })
  }

  try {
    // Verify trip exists
    const trip = await db.trip.findUnique({
      where: { id: tripId },
      include: { driver: true, truck: true, client: true },
    })

    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    const pdf = await buildWaybillPdf(tripId)
    const buffer = pdf.toBuffer()

    // Save report history
    await db.reportHistory.create({
      data: {
        type: 'waybill_report',
        title: `Waybill - ${trip.tripNumber || tripId.slice(-8)}`,
        format: 'pdf',
        parameters: JSON.stringify({ tripId }),
        generatedBy: auth.email,
        fileSize: buffer.length,
        status: 'completed',
      },
    })

    const filename = `waybill_${trip.tripNumber || tripId.slice(-8)}_${new Date().toISOString().split('T')[0]}.pdf`

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch (error) {
    console.error('[Reports] Waybill generation failed:', error)
    return NextResponse.json({ error: 'Failed to generate waybill' }, { status: 500 })
  }
}
