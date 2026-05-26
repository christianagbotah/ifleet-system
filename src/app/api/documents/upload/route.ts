import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { requireAuth, requireWriteAccess, requireRole, ROLES } from '@/lib/auth-server'
import { db } from '@/lib/db'

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const roleGuard = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (roleGuard instanceof NextResponse) return roleGuard

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type: ${file.type}. Allowed: images, PDF, DOCX` },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds 10MB limit (${(file.size / 1024 / 1024).toFixed(1)}MB)` },
        { status: 400 }
      )
    }

    const title = (formData.get('title') as string) || file.name
    const category = (formData.get('category') as string) || 'general'
    const description = (formData.get('description') as string) || null
    const entityType = (formData.get('entityType') as string) || null
    const entityId = (formData.get('entityId') as string) || null

    // Create unique filename
    const uniqueFilename = `${Date.now()}-${file.name}`
    const relativeDir = 'uploads/documents'
    const relativePath = `${relativeDir}/${uniqueFilename}`

    // Ensure directory exists
    const absoluteDir = path.join(process.cwd(), 'public', relativeDir)
    await mkdir(absoluteDir, { recursive: true })

    // Save file to disk
    const buffer = Buffer.from(await file.arrayBuffer())
    const absoluteFilePath = path.join(process.cwd(), 'public', relativePath)
    await writeFile(absoluteFilePath, buffer)

    // Create database record
    const document = await db.document.create({
      data: {
        title,
        description,
        category,
        entityType,
        entityId,
        fileName: file.name,
        filePath: `/${relativePath}`,
        fileSize: file.size,
        mimeType: file.type,
        uploadedBy: auth.userId,
      },
    })

    return NextResponse.json(document, { status: 201 })
  } catch (error) {
    console.error('Document upload error:', error)
    return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 })
  }
}
