import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { ROLES } from '@/lib/auth-server'

// DELETE /api/trips/[id]/comments/[commentId] — Delete a comment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id: tripId, commentId } = await params

    // Fetch the comment
    const comment = await db.tripComment.findUnique({
      where: { id: commentId },
      select: { id: true, tripId: true, userId: true },
    })

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    if (comment.tripId !== tripId) {
      return NextResponse.json({ error: 'Comment does not belong to this trip' }, { status: 400 })
    }

    // Only the comment author or Admin can delete
    const isAuthor = comment.userId === auth.userId
    const isAdmin = auth.roleName === ROLES.ADMIN

    if (!isAuthor && !isAdmin) {
      return NextResponse.json(
        { error: 'Only the comment author or an admin can delete this comment' },
        { status: 403 }
      )
    }

    await db.tripComment.delete({
      where: { id: commentId },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Error deleting trip comment:', error)
    return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 })
  }
}
