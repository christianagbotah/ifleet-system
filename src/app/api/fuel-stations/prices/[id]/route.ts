import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// GET /api/fuel-stations/prices/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { id } = await params

  const price = await db.fuelPrice.findUnique({
    where: { id },
    include: { fuelStation: true },
  })

  if (!price) {
    return NextResponse.json({ error: 'Price entry not found.' }, { status: 404 })
  }

  return NextResponse.json(price)
}

// PUT /api/fuel-stations/prices/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const writeGuard = requireWriteAccess(auth)
  if (writeGuard instanceof NextResponse) return writeGuard

  const { id } = await params

  try {
    const body = await request.json()
    const price = await db.fuelPrice.update({
      where: { id },
      data: body,
      include: { fuelStation: true },
    })

    return NextResponse.json(price)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to update price'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

// DELETE /api/fuel-stations/prices/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const writeGuard = requireWriteAccess(auth)
  if (writeGuard instanceof NextResponse) return writeGuard

  const { id } = await params

  try {
    await db.fuelPrice.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to delete price'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
