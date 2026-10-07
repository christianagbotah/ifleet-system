import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { validateBody, weightVerificationUpdateSchema } from '@/lib/validations'
import { calculateWeightVariance, WeightVarianceError } from '@/lib/domain/weight/variance'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const { id } = await params
    const record = await db.weightVerification.findUnique({
      where: { id },
      include: { trip: { select: { id: true, tripNumber: true, itemName: true, quantity: true, unit: true, loadingLocation: true, destination: true, truck: { select: { id: true, plateNumber: true, make: true, model: true } }, driver: { select: { id: true, firstName: true, lastName: true } } } } },
    })
    if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(record)
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to fetch' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard
    const { id } = await params
    const validation = validateBody(weightVerificationUpdateSchema, await request.json())
    if (!validation.success) return validation.response

    const existing = await db.weightVerification.findUnique({ where: { id }, select: { verifiedWeight: true, declaredWeight: true } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const input = validation.data
    const verifiedWeight = input.verifiedWeight ?? existing.verifiedWeight
    const declaredWeight = input.declaredWeight !== undefined ? input.declaredWeight : existing.declaredWeight
    const result = calculateWeightVariance(verifiedWeight, declaredWeight)
    const status = input.status === 'pending' || input.status === 'failed' ? input.status : result.status

    const record = await db.weightVerification.update({
      where: { id },
      data: {
        ...(input.verifiedWeight !== undefined ? { verifiedWeight: input.verifiedWeight } : {}),
        ...(input.declaredWeight !== undefined ? { declaredWeight: input.declaredWeight } : {}),
        variance: result.variance == null ? null : Math.round(result.variance * 100) / 100,
        variancePercent: result.variancePercent == null ? null : Math.round(result.variancePercent * 10) / 10,
        varianceClass: result.varianceClass,
        status,
        ...(input.checkpointType ? { checkpointType: input.checkpointType } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
      },
    })
    return NextResponse.json(record)
  } catch (error: unknown) {
    if (error instanceof WeightVarianceError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard
    const { id } = await params
    await db.weightVerification.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to delete' }, { status: 500 })
  }
}
