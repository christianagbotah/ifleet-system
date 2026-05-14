import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

// GET /api/weight-verifications/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const record = await db.weightVerification.findUnique({
      where: { id },
      include: {
        trip: {
          select: {
            id: true, tripNumber: true, itemName: true, quantity, unit,
            loadingLocation: true, destination: true,
            truck: { select: { id: true, plateNumber: true, make: true, model: true } },
            driver: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    })

    if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(record)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch'
    if (message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// PUT /api/weight-verifications/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const body = await request.json()
    const { verifiedWeight, declaredWeight, checkpointType, status, notes, location } = body

    // Recalculate variance if weights changed
    let variance: number | undefined = undefined
    let variancePercent: number | undefined = undefined
    let computedStatus: string | undefined = undefined

    const finalVerifiedWeight = verifiedWeight != null ? parseFloat(verifiedWeight) : undefined
    const finalDeclaredWeight = declaredWeight != null ? parseFloat(declaredWeight) : undefined

    if (finalVerifiedWeight != null && finalDeclaredWeight != null && finalDeclaredWeight > 0) {
      variance = Math.round((finalVerifiedWeight - finalDeclaredWeight) * 100) / 100
      variancePercent = Math.round((variance / finalDeclaredWeight) * 1000) / 10
      if (!status) {
        computedStatus = variancePercent > 5 ? 'overweight' : variancePercent < -5 ? 'underweight' : 'verified'
      }
    }

    const record = await db.weightVerification.update({
      where: { id },
      data: {
        ...(finalVerifiedWeight != null ? { verifiedWeight: finalVerifiedWeight } : {}),
        ...(finalDeclaredWeight != null ? { declaredWeight: finalDeclaredWeight } : {}),
        ...(variance != null ? { variance } : {}),
        ...(variancePercent != null ? { variancePercent } : {}),
        ...(status ? { status } : {}),
        ...(computedStatus ? { status: computedStatus } : {}),
        ...(checkpointType ? { checkpointType } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(location !== undefined ? { location } : {}),
      },
    })

    return NextResponse.json(record)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update'
    if (message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE /api/weight-verifications/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    await db.weightVerification.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete'
    if (message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
