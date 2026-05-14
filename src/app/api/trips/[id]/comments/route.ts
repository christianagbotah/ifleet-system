import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'

// GET /api/trips/[id]/comments — Fetch all comments for a trip
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params

    const comments = await db.tripComment.findMany({
      where: { tripId: id },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: { select: { name: true } },
          },
        },
      },
    })

    return NextResponse.json(
      comments.map((c) => ({
        id: c.id,
        tripId: c.tripId,
        userId: c.userId,
        message: c.message,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        user: {
          id: c.user.id,
          name: c.user.name,
          avatar: c.user.avatar,
          role: c.user.role.name,
        },
      }))
    )
  } catch (error: unknown) {
    console.error('Error fetching trip comments:', error)
    return NextResponse.json({ error: 'Failed to fetch trip comments' }, { status: 500 })
  }
}

// POST /api/trips/[id]/comments — Create a new comment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const body = await request.json()
    const { message } = body as { message?: string }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    if (message.length > 2000) {
      return NextResponse.json({ error: 'Message is too long (max 2000 characters)' }, { status: 400 })
    }

    // Verify the trip exists
    const trip = await db.trip.findUnique({
      where: { id },
      select: { id: true, tripNumber: true },
    })
    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    const comment = await db.tripComment.create({
      data: {
        tripId: id,
        userId: auth.userId,
        message: message.trim(),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: { select: { name: true } },
          },
        },
      },
    })

    return NextResponse.json({
      id: comment.id,
      tripId: comment.tripId,
      userId: comment.userId,
      message: comment.message,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      user: {
        id: comment.user.id,
        name: comment.user.name,
        avatar: comment.user.avatar,
        role: comment.user.role.name,
      },
    })
  } catch (error: unknown) {
    console.error('Error creating trip comment:', error)
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 })
  }
}
