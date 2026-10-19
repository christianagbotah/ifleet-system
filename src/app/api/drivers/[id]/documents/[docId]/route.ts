import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess, ROLES } from '@/lib/auth-server'

const DOCUMENT_ROOT = path.resolve(
  process.env.DOCUMENT_UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'documents'),
)

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

function safeStoredPath(filePath: string): string | null {
  if (!filePath || path.isAbsolute(filePath)) return null
  const resolved = path.resolve(DOCUMENT_ROOT, filePath)
  if (!resolved.startsWith(`${DOCUMENT_ROOT}${path.sep}`)) return null
  return resolved
}

// DELETE /api/drivers/[id]/documents/[docId] — staff-only document deletion.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
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

    const { id, docId } = await params
    const document = await db.document.findFirst({
      where: { id: docId, entityType: 'driver', entityId: id },
      select: { id: true, filePath: true },
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    await db.document.delete({ where: { id: docId } })

    const storedPath = safeStoredPath(document.filePath)
    if (storedPath) {
      await unlink(storedPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') console.error('Error deleting driver document file:', error)
      })
    }

    return NextResponse.json({ message: 'Document deleted successfully' })
  } catch (error) {
    console.error('Error deleting driver document:', error)
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
  }
}

// GET /api/drivers/[id]/documents/[docId] — get document metadata.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id, docId } = await params
    const driverGuard = driverReadGuard(auth, id)
    if (driverGuard) return driverGuard

    const document = await db.document.findFirst({
      where: { id: docId, entityType: 'driver', entityId: id },
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

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    return NextResponse.json(documentDto(document, id))
  } catch (error) {
    console.error('Error fetching driver document:', error)
    return NextResponse.json({ error: 'Failed to fetch document' }, { status: 500 })
  }
}
