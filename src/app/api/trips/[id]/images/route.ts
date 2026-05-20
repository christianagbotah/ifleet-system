import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

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
    const body = await request.json()
    const { images } = body

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { error: 'No images provided. Send an array of base64 image strings.' },
        { status: 400 }
      )
    }

    const trip = await db.trip.findUnique({ where: { id } })
    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    // Parse existing image URLs
    const existingUrls: string[] = JSON.parse(trip.imageUrls || '[]')

    // Append new images
    const updatedUrls = [...existingUrls, ...images]

    await db.trip.update({
      where: { id },
      data: { imageUrls: JSON.stringify(updatedUrls) },
    })

    return NextResponse.json({
      message: `${images.length} image(s) added successfully`,
      totalImages: updatedUrls.length,
    })
  } catch (error) {
    console.error('Error adding images:', error)
    return NextResponse.json(
      { error: 'Failed to add images', details: String(error) },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const imageUrl = searchParams.get('url')

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Missing image URL to remove. Provide ?url=<encoded-url>' },
        { status: 400 }
      )
    }

    const trip = await db.trip.findUnique({ where: { id } })
    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    const existingUrls: string[] = JSON.parse(trip.imageUrls || '[]')
    const updatedUrls = existingUrls.filter((url) => url !== imageUrl)

    if (updatedUrls.length === existingUrls.length) {
      return NextResponse.json({ error: 'Image URL not found in trip' }, { status: 404 })
    }

    await db.trip.update({
      where: { id },
      data: { imageUrls: JSON.stringify(updatedUrls) },
    })

    return NextResponse.json({
      message: 'Image removed successfully',
      totalImages: updatedUrls.length,
    })
  } catch (error) {
    console.error('Error removing image:', error)
    return NextResponse.json(
      { error: 'Failed to remove image', details: String(error) },
      { status: 500 }
    )
  }
}
