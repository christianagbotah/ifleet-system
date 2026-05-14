import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const incentive = await db.driverIncentive.findUnique({
      where: { id },
      include: {
        driver: { select: { id: true, driverName: true, phone: true } },
        trip: { select: { id: true, tripNumber: true } },
      },
    })

    if (!incentive) {
      return NextResponse.json({ error: 'Incentive not found' }, { status: 404 })
    }

    return NextResponse.json(incentive)
  } catch (error) {
    console.error('Error fetching incentive:', error)
    return NextResponse.json(
      { error: 'Failed to fetch incentive' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.driverIncentive.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Incentive not found' }, { status: 404 })
    }

    // Handle status transitions
    const statusTransitions: Record<string, Record<string, object>> = {
      pending: {
        approved: { approvedAt: new Date() },
      },
      approved: {
        paid: { paidAt: new Date() },
        pending: {},
      },
    }

    const now = new Date()
    let updateData: Record<string, unknown> = {
      ...(body.amount !== undefined && { amount: parseFloat(body.amount) }),
      ...(body.incentiveType !== undefined && { incentiveType: body.incentiveType }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.period !== undefined && { period: body.period }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.approvedBy !== undefined && { approvedBy: body.approvedBy }),
    }

    // Handle status changes with timestamps
    if (body.status !== undefined && body.status !== existing.status) {
      const fromState = existing.status
      const toState = body.status
      const transition = statusTransitions[fromState]?.[toState]

      if (!transition) {
        return NextResponse.json(
          { error: `Invalid status transition from '${fromState}' to '${toState}'` },
          { status: 400 }
        )
      }

      updateData.status = toState
      if ('approvedAt' in transition) updateData.approvedAt = now
      if ('paidAt' in transition) updateData.paidAt = now
    }

    const incentive = await db.driverIncentive.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(incentive)
  } catch (error) {
    console.error('Error updating incentive:', error)
    return NextResponse.json(
      { error: 'Failed to update incentive', details: String(error) },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.driverIncentive.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Incentive not found' }, { status: 404 })
    }

    if (existing.status !== 'pending') {
      return NextResponse.json(
        { error: 'Can only delete incentives with pending status' },
        { status: 400 }
      )
    }

    await db.driverIncentive.delete({ where: { id } })

    return NextResponse.json({ message: 'Incentive deleted successfully' })
  } catch (error) {
    console.error('Error deleting incentive:', error)
    return NextResponse.json(
      { error: 'Failed to delete incentive', details: String(error) },
      { status: 500 }
    )
  }
}
