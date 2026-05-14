import { NextRequest, NextResponse } from 'next/server'
import { stat, createReadStream } from 'fs'
import path from 'path'
import { requireAuth, ROLES } from '@/lib/auth-server'
import { db } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const document = await db.document.findUnique({
      where: { id },
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Drivers can only download their own documents
    if (auth.roleName === ROLES.DRIVER) {
      const isOwnDocument =
        document.uploadedBy === auth.userId ||
        (document.entityType === 'driver' && document.entityId === auth.driverId)
      if (!isOwnDocument) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    // Construct file path
    const filePath = path.join(process.cwd(), 'public', document.filePath)

    // Check file exists on disk
    const fileStat = await new Promise<{ size: number }>((resolve, reject) => {
      stat(filePath, (err, stats) => {
        if (err) reject(err)
        else resolve(stats)
      })
    }).catch(() => null)

    if (!fileStat) {
      return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
    }

    // Stream the file with appropriate headers
    const fileStream = createReadStream(filePath)
    const headers = new Headers()
    headers.set('Content-Type', document.mimeType || 'application/octet-stream')
    headers.set('Content-Disposition', `attachment; filename="${document.fileName}"`)
    headers.set('Content-Length', String(fileStat.size))

    return new NextResponse(fileStream as unknown as ReadableStream, { headers })
  } catch (error) {
    console.error('Document download error:', error)
    return NextResponse.json({ error: 'Failed to download document' }, { status: 500 })
  }
}
