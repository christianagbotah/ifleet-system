import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess, ROLES } from '@/lib/auth-server'

const MAX_SIZE = 5 * 1024 * 1024
const DOCUMENT_ROOT = path.resolve(
  process.env.DOCUMENT_UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'documents'),
)
const VALID_TYPES = new Set(['license', 'insurance', 'background_check', 'medical', 'other'])
const MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
}

function driverReadGuard(
  auth: { roleName: string; driverId: string | null },
  driverId: string,
): NextResponse | null {
  if (auth.roleName !== ROLES.DRIVER) return null
  if (!auth.driverId) {
    return NextResponse.json({ error: 'Driver profile is not linked' }, { status: 403 })
  }
  if (auth.driverId !== driverId) {
    return NextResponse.json({ error: 'You can only access your own documents' }, { status: 403 })
  }
  return null
}

function documentDto(document: {
  id: string
  title: string
  description: string | null
  category: string
  fileName: string
  fileSize: number
  mimeType: string
  createdAt: Date
  updatedAt: Date
}, driverId: string) {
  return {
    id: document.id,
    documentType: document.category,
    documentName: document.title,
    fileName: document.fileName,
    fileSize: document.fileSize,
    mimeType: document.mimeType,
    status: 'active',
    expiryDate: null,
    issuedDate: null,
    notes: document.description,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    downloadUrl: `/api/drivers/${driverId}/documents/${document.id}/download`,
  }
}

function decodeFileData(fileData: unknown, declaredMimeType: string): Buffer | null {
  if (typeof fileData !== 'string') return null
  const match = /^data:([^;]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(fileData)
  if (!match || match[1] !== declaredMimeType) return null
  try {
    return Buffer.from(match[2], 'base64')
  } catch {
    return null
  }
}

// GET /api/drivers/[id]/documents — list documents for a driver.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const driverGuard = driverReadGuard(auth, id)
    if (driverGuard) return driverGuard

    const driver = await db.driver.findUnique({ where: { id }, select: { id: true } })
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
        fileSize: true,
        mimeType: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json(documents.map((document) => documentDto(document, id)))
  } catch (error) {
    console.error('Error fetching driver documents:', error)
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
  }
}

// POST /api/drivers/[id]/documents — staff upload for a driver.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let writtenPath: string | null = null
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard
    if (auth.roleName === ROLES.DRIVER) {
      return NextResponse.json(
        { error: 'Driver document changes must be made by fleet staff' },
        { status: 403 },
      )
    }

    const { id } = await params
    const driver = await db.driver.findUnique({ where: { id }, select: { id: true } })
    if (!driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 })
    }

    const body = await request.json()
    const documentType = typeof body.documentType === 'string' ? body.documentType.trim() : ''
    const documentName = typeof body.documentName === 'string' ? body.documentName.trim() : ''
    const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : ''
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim() : ''
    const notes = typeof body.notes === 'string'
      ? body.notes.trim()
      : typeof body.description === 'string'
        ? body.description.trim()
        : ''

    if (!documentType || !documentName || !fileName || !mimeType || !body.fileData) {
      return NextResponse.json(
        { error: 'Missing required fields: documentType, documentName, fileName, mimeType, fileData' },
        { status: 400 },
      )
    }
    if (!VALID_TYPES.has(documentType)) {
      return NextResponse.json(
        { error: `Invalid document type. Must be one of: ${[...VALID_TYPES].join(', ')}` },
        { status: 400 },
      )
    }
    const extension = MIME_EXTENSIONS[mimeType]
    if (!extension) {
      return NextResponse.json({ error: 'Unsupported document file type' }, { status: 400 })
    }

    const fileBuffer = decodeFileData(body.fileData, mimeType)
    if (!fileBuffer) {
      return NextResponse.json({ error: 'Invalid document file data' }, { status: 400 })
    }
    if (fileBuffer.length > MAX_SIZE) {
      return NextResponse.json({ error: 'File size exceeds 5MB limit' }, { status: 400 })
    }
    if (body.fileSize != null && Number(body.fileSize) !== fileBuffer.length) {
      return NextResponse.json({ error: 'Document file size does not match uploaded data' }, { status: 400 })
    }

    const relativeDirectory = path.join('drivers', id)
    const storageDirectory = path.resolve(DOCUMENT_ROOT, relativeDirectory)
    if (!storageDirectory.startsWith(`${DOCUMENT_ROOT}${path.sep}`)) {
      return NextResponse.json({ error: 'Invalid document storage path' }, { status: 400 })
    }
    await mkdir(storageDirectory, { recursive: true })
    const storedName = `${randomUUID()}${extension}`
    writtenPath = path.join(storageDirectory, storedName)
    await writeFile(writtenPath, fileBuffer, { flag: 'wx' })

    const document = await db.document.create({
      data: {
        title: documentName,
        description: notes || null,
        category: documentType,
        entityType: 'driver',
        entityId: id,
        fileName,
        filePath: path.join(relativeDirectory, storedName),
        fileSize: fileBuffer.length,
        mimeType,
        uploadedBy: auth.userId,
      },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    writtenPath = null

    return NextResponse.json(documentDto(document, id), { status: 201 })
  } catch (error) {
    if (writtenPath) {
      await unlink(writtenPath).catch(() => undefined)
    }
    console.error('Error creating driver document:', error)
    return NextResponse.json({ error: 'Failed to create document' }, { status: 500 })
  }
}
