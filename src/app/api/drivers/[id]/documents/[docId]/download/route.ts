import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, ROLES } from '@/lib/auth-server'
import { db } from '@/lib/db'

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

function resolveStoredPath(filePath: string): string | null {
  if (!filePath || path.isAbsolute(filePath)) return null
  const resolved = path.resolve(DOCUMENT_ROOT, filePath)
  return resolved.startsWith(`${DOCUMENT_ROOT}${path.sep}`) ? resolved : null
}

function safeDownloadName(fileName: string): string {
  const cleaned = path.basename(fileName).replace(/["\r\n\\]/g, '_').trim()
  return cleaned || 'document'
}

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
        fileName: true,
        filePath: true,
        mimeType: true,
      },
    })
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const storedPath = resolveStoredPath(document.filePath)
    if (!storedPath) {
      return NextResponse.json({ error: 'Document file not available' }, { status: 404 })
    }

    let bytes: Buffer
    try {
      bytes = await readFile(storedPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return NextResponse.json({ error: 'Document file not found' }, { status: 404 })
      }
      throw error
    }

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': document.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${safeDownloadName(document.fileName)}"`,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('Error downloading driver document:', error)
    return NextResponse.json({ error: 'Failed to download document' }, { status: 500 })
  }
}
