import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess, ROLES, type AuthContext } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params

    // Drivers can only view their own profile
    if (auth.roleName === ROLES.DRIVER && auth.driverId !== id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const isDriver = auth.roleName === ROLES.DRIVER

    const driver = await db.driver.findUnique({
      where: { id },
      include: {
        Truck: {
          where: { status: 'active' },
          select: { id: true, plateNumber: true, make: true, model: true },
        },
        ...(isDriver
          ? {
              // Drivers only see limited trip info (no financials)
              Trip: {
                orderBy: { departureTime: 'desc' },
                take: 20,
                select: {
                  id: true, tripNumber: true, status: true, departureTime: true,
                  arrivalTime: true, loadingLocation: true, destination: true,
                  itemName: true, quantity: true, unit: true,
                  truck: { select: { id: true, plateNumber: true, make: true, model: true } },
                },
              },
            }
          : {
              // Admin/Manager see everything
              trips: {
                orderBy: { departureTime: 'desc' },
                take: 20,
                include: {
                  truck: { select: { id: true, plateNumber: true, make: true, model: true } },
                },
              },
              payroll: {
                orderBy: [{ year: 'desc' }, { month: 'desc' }],
              },
            }),
      },
    })

    if (!driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 })
    }

    return NextResponse.json(driver)
  } catch (error) {
    console.error('Driver detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch driver' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params

    // Drivers can only update their own profile (phone, email only)
    if (auth.roleName === ROLES.DRIVER) {
      if (auth.driverId !== id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
      const body = await request.json()
      const { phone, email } = body
      const driver = await db.driver.findUnique({ where: { id } })
      if (!driver) return NextResponse.json({ error: 'Driver not found' }, { status: 404 })

      if (phone && phone !== driver.phone) {
        const existing = await db.driver.findUnique({ where: { phone } })
        if (existing) return NextResponse.json({ error: 'Driver with this phone number already exists' }, { status: 400 })
      }

      const updateData: Record<string, unknown> = {}
      if (phone !== undefined) updateData.phone = phone
      if (email !== undefined) updateData.email = email || null

      const updatedDriver = await db.driver.update({ where: { id }, data: updateData })
      return NextResponse.json(updatedDriver)
    }

    // Admin/Manager: full write access
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()

    const driver = await db.driver.findUnique({ where: { id } })
    if (!driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 })
    }

    const {
      firstName,
      lastName,
      phone,
      email,
      licenseNumber,
      licenseExpiry,
      licenseClass,
      emergencyName,
      emergencyPhone,
      address,
      dateOfBirth,
      rating,
      status,
      employeeId,
      ghanaCardNumber,
      ghanaCardExpiry,
      photo,
      licenseImage,
      ghanaCardFrontImage,
      ghanaCardBackImage,
      verificationStatus,
      verificationNotes,
    } = body

    // Check phone uniqueness if changing
    if (phone && phone !== driver.phone) {
      const existing = await db.driver.findUnique({ where: { phone } })
      if (existing) {
        return NextResponse.json({ error: 'Driver with this phone number already exists' }, { status: 400 })
      }
    }

    // Check license uniqueness if changing
    if (licenseNumber && licenseNumber !== driver.licenseNumber) {
      const existing = await db.driver.findUnique({ where: { licenseNumber } })
      if (existing) {
        return NextResponse.json({ error: 'Driver with this license number already exists' }, { status: 400 })
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {
      ...(firstName !== undefined && { firstName }),
      ...(lastName !== undefined && { lastName }),
      ...(phone !== undefined && { phone }),
      ...(email !== undefined && { email: email || null }),
      ...(licenseNumber !== undefined && { licenseNumber }),
      ...(licenseExpiry !== undefined && { licenseExpiry: new Date(licenseExpiry) }),
      ...(licenseClass !== undefined && { licenseClass }),
      ...(emergencyName !== undefined && { emergencyName }),
      ...(emergencyPhone !== undefined && { emergencyPhone }),
      ...(address !== undefined && { address }),
      ...(dateOfBirth !== undefined && { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null }),
      ...(rating !== undefined && { rating: parseFloat(rating) }),
      ...(status !== undefined && { status }),
      ...(employeeId !== undefined && { employeeId }),
      ...(ghanaCardNumber !== undefined && { ghanaCardNumber: ghanaCardNumber || null }),
      ...(ghanaCardExpiry !== undefined && { ghanaCardExpiry: ghanaCardExpiry ? new Date(ghanaCardExpiry) : null }),
      ...(photo !== undefined && { photo: photo || null }),
      ...(licenseImage !== undefined && { licenseImage: licenseImage || null }),
      ...(ghanaCardFrontImage !== undefined && { ghanaCardFrontImage: ghanaCardFrontImage || null }),
      ...(ghanaCardBackImage !== undefined && { ghanaCardBackImage: ghanaCardBackImage || null }),
      ...(verificationNotes !== undefined && { verificationNotes }),
      ...(verificationStatus !== undefined && {
        verificationStatus,
        // Automatically set verifiedAt when status changes to verified or rejected
        ...(verificationStatus === 'verified' || verificationStatus === 'rejected'
          ? { verifiedAt: new Date() }
          : {}),
      }),
    }

    // Collect changed fields for audit log
    const changes: Record<string, unknown> = {}
    if (firstName !== undefined && firstName !== driver.firstName) changes.firstName = firstName
    if (lastName !== undefined && lastName !== driver.lastName) changes.lastName = lastName
    if (phone !== undefined && phone !== driver.phone) changes.phone = phone
    if (email !== undefined && email !== driver.email) changes.email = email
    if (licenseNumber !== undefined && licenseNumber !== driver.licenseNumber) changes.licenseNumber = licenseNumber
    if (status !== undefined && status !== driver.status) changes.status = status
    if (verificationStatus !== undefined && verificationStatus !== driver.verificationStatus) changes.verificationStatus = verificationStatus
    if (employeeId !== undefined && employeeId !== driver.employeeId) changes.employeeId = employeeId

    const updatedDriver = await db.driver.update({
      where: { id },
      data: updateData,
    })

    // Audit log: driver updated (fire-and-forget)
    if (Object.keys(changes).length > 0) {
      createAuditLog({
        userId: auth.userId,
        action: 'update',
        entity: 'Driver',
        entityId: id,
        details: changes,
        ipAddress: getClientIp(request),
      }).catch(() => {})
    }

    return NextResponse.json(updatedDriver)
  } catch (error) {
    console.error('Driver update error:', error)
    return NextResponse.json({ error: 'Failed to update driver' }, { status: 500 })
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

    const driver = await db.driver.findUnique({ where: { id } })
    if (!driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 })
    }

    const updatedDriver = await db.driver.update({
      where: { id },
      data: { status: 'inactive' },
    })

    // Audit log: driver deactivated (fire-and-forget)
    createAuditLog({
      userId: auth.userId,
      action: 'delete',
      entity: 'Driver',
      entityId: id,
      details: { name: `${driver.firstName} ${driver.lastName}`, previousStatus: driver.status },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(updatedDriver)
  } catch (error) {
    console.error('Driver delete error:', error)
    return NextResponse.json({ error: 'Failed to deactivate driver' }, { status: 500 })
  }
}
