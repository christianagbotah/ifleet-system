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

    const record = await db.roadConditionReport.findUnique({
      where: { id },
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        trip: { select: { id: true, tripNumber: true } },
      },
    })

    if (!record) {
      return NextResponse.json({ error: 'Road condition report not found' }, { status: 404 })
    }

    return NextResponse.json(record)
  } catch (error) {
    console.error('Road condition detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch road condition report' }, { status: 500 })
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

    const existing = await db.roadConditionReport.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Road condition report not found' }, { status: 404 })
    }

    // Handle status transitions
    const { status, condition, severity, description, hazardType, imageUrl, latitude, longitude } = body

    const updateData: Record<string, unknown> = {}

    if (status) {
      const validStatuses = ['active', 'resolved', 'ignored']
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: 'status must be one of: active, resolved, ignored' },
          { status: 400 }
        )
      }
      updateData.status = status
      if ((status === 'resolved' || status === 'ignored') && !existing.resolvedAt) {
        updateData.resolvedAt = new Date()
      }
    }

    if (condition) {
      const validConditions = ['good', 'fair', 'poor', 'blocked']
      if (!validConditions.includes(condition)) {
        return NextResponse.json(
          { error: 'condition must be one of: good, fair, poor, blocked' },
          { status: 400 }
        )
      }
      updateData.condition = condition
    }

    if (severity) {
      const validSeverities = ['low', 'medium', 'high', 'critical']
      if (!validSeverities.includes(severity)) {
        return NextResponse.json(
          { error: 'severity must be one of: low, medium, high, critical' },
          { status: 400 }
        )
      }
      updateData.severity = severity
    }

    if (description !== undefined) updateData.description = description || null
    if (hazardType) updateData.hazardType = hazardType
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl || null
    if (latitude !== undefined) updateData.latitude = latitude ? parseFloat(latitude) : null
    if (longitude !== undefined) updateData.longitude = longitude ? parseFloat(longitude) : null

    const record = await db.roadConditionReport.update({
      where: { id },
      data: updateData,
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        trip: { select: { id: true, tripNumber: true } },
      },
    })

    return NextResponse.json(record)
  } catch (error) {
    console.error('Road condition update error:', error)
    return NextResponse.json({ error: 'Failed to update road condition report' }, { status: 500 })
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

    const existing = await db.roadConditionReport.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Road condition report not found' }, { status: 404 })
    }

    await db.roadConditionReport.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Road condition delete error:', error)
    return NextResponse.json({ error: 'Failed to delete road condition report' }, { status: 500 })
  }
}
