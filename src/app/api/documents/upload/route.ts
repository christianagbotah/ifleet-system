import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { requireAuth } from '@/lib/auth-server'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Extract metadata fields
    const title = (formData.get('title') as string) || file.name
    const description = (formData.get('description') as string) || null
    const category = (formData.get('category') as string) || 'other'
    const entityType = (formData.get('entityType') as string) || null
    const entityId = (formData.get('entityId') as string) || null

    // Generate unique file path
    const ext = path.extname(file.name) || ''
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'documents')

    // Ensure directory exists
    await mkdir(uploadsDir, { recursive: true })

    const filePath = path.join(uploadsDir, uniqueName)

    // Write file to disk
    const bytes = await file.arrayBuffer()
    await writeFile(filePath, Buffer.from(bytes))

    // Create database record
    const document = await db.document.create({
      data: {
        title,
        description,
        category,
        entityType,
        entityId,
        fileName: file.name,
        filePath: `uploads/documents/${uniqueName}`,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        uploadedBy: auth.userId,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json(document)
  } catch (error) {
    console.error('Document upload error:', error)
    return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 })
  }
}
