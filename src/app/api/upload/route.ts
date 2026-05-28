import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const formData = await request.formData()
    const files = formData.getAll('files')

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    const urls: string[] = []
    const errors: string[] = []

    // Ensure upload directory exists
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'images')
    await mkdir(uploadDir, { recursive: true })

    for (const file of files) {
      if (!(file instanceof File)) {
        errors.push('Invalid file entry (not a File)')
        continue
      }

      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        errors.push(`"${file.name}" has unsupported type: ${file.type}`)
        continue
      }

      if (file.size > MAX_FILE_SIZE) {
        errors.push(`"${file.name}" exceeds 5MB limit (${(file.size / 1024 / 1024).toFixed(1)}MB)`)
        continue
      }

      // Create unique filename
      const ext = file.name.split('.').pop() || 'jpg'
      const uniqueFilename = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`
      const relativePath = `/uploads/images/${uniqueFilename}`

      // Save file to disk
      const buffer = Buffer.from(await file.arrayBuffer())
      const absoluteFilePath = path.join(process.cwd(), 'public', relativePath)
      await writeFile(absoluteFilePath, buffer)

      urls.push(relativePath)
    }

    if (urls.length === 0) {
      return NextResponse.json(
        { error: 'No valid files uploaded', details: errors },
        { status: 400 }
      )
    }

    const response: { urls: string[]; errors?: string[] } = { urls }
    if (errors.length > 0) {
      response.errors = errors
    }

    return NextResponse.json(response, { status: 201 })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Failed to upload files' }, { status: 500 })
  }
}
