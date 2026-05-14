import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// DELETE /api/drivers/[id]/documents/[docId] — delete a document
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await params

    // Verify document exists and belongs to this driver
    const document = await db.driverDocument.findFirst({
      where: { id: docId, driverId: id },
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    await db.driverDocument.delete({
      where: { id: docId },
    })

    return NextResponse.json({ message: 'Document deleted successfully' })
  } catch (error) {
    console.error('Error deleting driver document:', error)
    return NextResponse.json(
      { error: 'Failed to delete document', details: String(error) },
      { status: 500 }
    )
  }
}

// GET /api/drivers/[id]/documents/[docId] — get a single document with file data
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await params

    const document = await db.driverDocument.findFirst({
      where: { id: docId, driverId: id },
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    return NextResponse.json(document)
  } catch (error) {
    console.error('Error fetching driver document:', error)
    return NextResponse.json(
      { error: 'Failed to fetch document' },
      { status: 500 }
    )
  }
}
