import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

const VALID_STATUSES = ['pending', 'submitted', 'verified', 'rejected']

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { driverIds, status, notes, verifiedBy, verifierName } = body

    if (!Array.isArray(driverIds) || driverIds.length === 0) {
      return NextResponse.json(
        { error: 'driverIds must be a non-empty array' },
        { status: 400 }
      )
    }

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    const results: {
      driverId: string
      previousStatus: string
      newStatus: string
    }[] = []

    for (const driverId of driverIds) {
      const driver = await db.driver.findUnique({ where: { id: driverId } })

      if (!driver) {
        results.push({
          driverId,
          previousStatus: 'not_found',
          newStatus: status,
        })
        continue
      }

      const previousStatus = driver.verificationStatus

      // Build document status JSON
      const documentStatus = JSON.stringify({
        photo: driver.photo ? 'uploaded' : 'missing',
        licenseImage: driver.licenseImage ? 'uploaded' : 'missing',
        ghanaCardFrontImage: driver.ghanaCardFrontImage
          ? 'uploaded'
          : 'missing',
        ghanaCardBackImage: driver.ghanaCardBackImage
          ? 'uploaded'
          : 'missing',
        licenseNumber: driver.licenseNumber ? 'uploaded' : 'missing',
        ghanaCardNumber: driver.ghanaCardNumber ? 'uploaded' : 'missing',
      })

      // Update driver verification status
      const updateData: Record<string, unknown> = {
        verificationStatus: status,
      }

      if (status === 'verified' || status === 'rejected') {
        updateData.verifiedAt = new Date()
      }

      if (verifiedBy) {
        updateData.verifiedBy = verifiedBy
      }

      await db.driver.update({
        where: { id: driverId },
        data: updateData,
      })

      // Create verification history record
      await db.verificationHistory.create({
        data: {
          driverId,
          previousStatus,
          newStatus: status,
          verifiedBy: verifiedBy || null,
          verifierName: verifierName || null,
          notes: notes || null,
          documentStatus,
        },
      })

      results.push({
        driverId,
        previousStatus,
        newStatus: status,
      })
    }

    const updated = results.filter((r) => r.previousStatus !== 'not_found').length

    return NextResponse.json({
      success: true,
      updated,
      results,
    })
  } catch (error) {
    console.error('Bulk verification error:', error)
    return NextResponse.json(
      { error: 'Failed to process bulk verification' },
      { status: 500 }
    )
  }
}
