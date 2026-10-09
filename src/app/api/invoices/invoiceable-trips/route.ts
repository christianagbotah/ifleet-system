import { NextRequest, NextResponse } from 'next/server'

import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { deriveTripInvoiceLine } from '@/lib/domain/billing/trip-invoice'

// GET /api/invoices/invoiceable-trips — reconciled/completed client trips without an invoice.
export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const writeAccess = requireWriteAccess(auth)
  if (writeAccess instanceof NextResponse) return writeAccess

  try {
    const clientId = new URL(request.url).searchParams.get('clientId') || undefined
    const trips = await db.trip.findMany({
      where: {
        status: { in: ['reconciled', 'completed'] },
        clientId: clientId ?? { not: null },
        Invoice: null,
      },
      select: {
        id: true,
        tripNumber: true,
        clientId: true,
        customerName: true,
        status: true,
        itemName: true,
        unit: true,
        quantity: true,
        unitPrice: true,
        totalRevenue: true,
        loadingLocation: true,
        destination: true,
        departureTime: true,
        client: { select: { companyName: true } },
      },
      orderBy: { departureTime: 'desc' },
      take: 100,
    })

    const tripIds = trips.map((trip) => trip.id)
    const proofs = tripIds.length
      ? await db.proofOfDelivery.findMany({
          where: { tripId: { in: tripIds } },
          select: { id: true, tripId: true, acceptedQty: true, unit: true, supersedesId: true },
          orderBy: { createdAt: 'asc' },
        })
      : []

    const byTrip = new Map<string, typeof proofs>()
    for (const proof of proofs) {
      const group = byTrip.get(proof.tripId) ?? []
      group.push(proof)
      byTrip.set(proof.tripId, group)
    }

    const data = trips.flatMap((trip) => {
      try {
        const line = deriveTripInvoiceLine({
          tripId: trip.id,
          tripNumber: trip.tripNumber,
          status: trip.status,
          itemName: trip.itemName,
          unit: trip.unit,
          dispatchedQuantity: trip.quantity,
          unitPrice: trip.unitPrice == null ? null : Number(trip.unitPrice),
          totalRevenue: trip.totalRevenue == null ? null : Number(trip.totalRevenue),
          proofs: (byTrip.get(trip.id) ?? []).map((proof) => ({
            id: proof.id,
            acceptedQty: proof.acceptedQty,
            unit: proof.unit,
            supersedesId: proof.supersedesId,
          })),
        })
        return [{
          id: trip.id,
          tripNumber: trip.tripNumber,
          clientId: trip.clientId,
          clientName: trip.client?.companyName ?? trip.customerName ?? 'Unassigned',
          route: `${trip.loadingLocation} → ${trip.destination}`,
          itemName: trip.itemName,
          unit: trip.unit,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          total: line.total,
          departureTime: trip.departureTime.toISOString(),
        }]
      } catch {
        return []
      }
    })

    return NextResponse.json({ data })
  } catch (error) {
    console.error('GET /api/invoices/invoiceable-trips error:', error)
    return NextResponse.json({ error: 'Failed to load invoiceable trips' }, { status: 500 })
  }
}
