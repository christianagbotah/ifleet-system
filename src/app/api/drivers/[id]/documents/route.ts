import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/drivers/[id]/documents — list all documents for a driver
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Verify driver exists
    const driver = await db.driver.findUnique({ where: { id } })
    if (!driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 })
    }

    const documents = await db.driverDocument.findMany({
      where: { driverId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        documentType: true,
        documentName: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        status: true,
        expiryDate: true,
        issuedDate: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        // fileData excluded from list for performance
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
      fileSize,
      mimeType,
      fileData,
      status,
      expiryDate,
      issuedDate,
      notes,
    } = body

    // Validate required fields
    if (!documentType || !documentName || !fileName || !mimeType || !fileData) {
      return NextResponse.json(
        { error: 'Missing required fields: documentType, documentName, fileName, mimeType, fileData' },
        { status: 400 }
      )
    }

    // Max file size: 5MB (base64 is ~1.37x the original size, so ~7MB base64 string)
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

    const document = await db.driverDocument.create({
      data: {
        driverId: id,
        documentType,
        documentName,
        fileName,
        fileSize: fileSize || 0,
        mimeType,
        fileData,
        status: status || 'active',
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        issuedDate: issuedDate ? new Date(issuedDate) : null,
        notes: notes || null,
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
