import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params

    const record = await db.vehicleInspection.findUnique({
      where: { id },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
        trip: { select: { id: true, tripNumber: true } },
      },
    })

    if (!record) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
    }

    return NextResponse.json(record)
  } catch (error) {
    console.error('Inspection detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch inspection' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params
    const body = await request.json()

    const existing = await db.vehicleInspection.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
    }

    // If checkItems are being updated, recompute counts and result
    let updateData: Record<string, unknown> = { ...body }

    if (Array.isArray(body.checkItems)) {
      const parsedItems = body.checkItems as { name: string; category: string; status: string; notes?: string; severity?: string }[]
      let passCount = 0
      let warningCount = 0
      let failCount = 0
      let defectsFound = false
      const defectDetails: { item: string; severity: string; description: string; photoUrl?: string }[] = []

      for (const item of parsedItems) {
        if (item.status === 'ok') passCount++
        else if (item.status === 'warning') warningCount++
        else if (item.status === 'fail') {
          failCount++
          defectsFound = true
          defectDetails.push({
            item: item.name,
            severity: item.severity || 'medium',
            description: item.notes || 'Failed check',
          })
        }
      }

      let result: string
      if (failCount > 0) result = 'fail'
      else if (warningCount > 0) result = 'conditional_pass'
      else result = 'pass'

      updateData.checkItems = JSON.stringify(parsedItems)
      updateData.totalChecks = parsedItems.length
      updateData.passCount = passCount
      updateData.warningCount = warningCount
      updateData.failCount = failCount
      updateData.defectsFound = defectsFound
      updateData.defectDetails = defectDetails.length > 0 ? JSON.stringify(defectDetails) : null
      updateData.result = result

      // If completing follow-up
      if (body.followUpCompleted) {
        updateData.followUpCompletedAt = new Date()
        updateData.requiresFollowUp = false
      }
    }

    // Remove fields that shouldn't be directly set
    delete updateData.id
    delete updateData.createdAt
    delete updateData.updatedAt

    const record = await db.vehicleInspection.update({
      where: { id },
      data: updateData,
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
        trip: { select: { id: true, tripNumber: true } },
      },
    })

    return NextResponse.json(record)
  } catch (error) {
    console.error('Inspection update error:', error)
    return NextResponse.json({ error: 'Failed to update inspection' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params

    const existing = await db.vehicleInspection.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
    }

    await db.vehicleInspection.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Inspection delete error:', error)
    return NextResponse.json({ error: 'Failed to delete inspection' }, { status: 500 })
  }
}
