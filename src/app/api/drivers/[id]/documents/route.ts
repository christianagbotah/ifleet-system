import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// GET /api/drivers/[id]/documents — list all documents for a driver
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params

    // Verify driver exists
    const driver = await db.driver.findUnique({ where: { id } })
    if (!driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 })
    }

    const documents = await db.document.findMany({
      where: { entityType: 'driver', entityId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        fileName: true,
        filePath: true,
        fileSize: true,
        mimeType: true,
        uploadedBy: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json(documents)
  } catch (error) {
    console.error('Error fetching driver documents:', error)
    return NextResponse.json(
      { error: 'Failed to fetch documents' },
      { status: 500 }
    )
  }
}

// POST /api/drivers/[id]/documents — upload a new document
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params

    // Verify driver exists
    const driver = await db.driver.findUnique({ where: { id } })
    if (!driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 })
    }

    const body = await request.json()
    const {
      documentType,
      documentName,
      fileName,
      filePath,
      fileSize,
      mimeType,
      description,
    } = body

    // Validate required fields
    if (!documentType || !documentName || !fileName || !mimeType) {
      return NextResponse.json(
        { error: 'Missing required fields: documentType, documentName, fileName, mimeType' },
        { status: 400 }
      )
    }

    // Max file size: 5MB
    const MAX_SIZE = 5 * 1024 * 1024
    if (fileSize && fileSize > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 5MB limit' },
        { status: 400 }
      )
    }

    // Validate document type
    const validTypes = ['license', 'insurance', 'background_check', 'medical', 'other']
    if (!validTypes.includes(documentType)) {
      return NextResponse.json(
        { error: `Invalid document type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    const document = await db.document.create({
      data: {
        title: documentName,
        description: description || null,
        category: documentType,
        entityType: 'driver',
        entityId: id,
        fileName,
        filePath: filePath || `/uploads/drivers/${id}/${fileName}`,
        fileSize: fileSize || 0,
        mimeType,
        uploadedBy: auth.userId,
      },
    })

    return NextResponse.json(document, { status: 201 })
  } catch (error) {
    console.error('Error creating driver document:', error)
    return NextResponse.json(
      { error: 'Failed to create document', details: String(error) },
      { status: 500 }
    )
  }
}
