import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'
import { hashPassword } from '@/lib/auth-utils'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}

    if (status) where.status = status
    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { phone: { contains: search } },
        { licenseNumber: { contains: search } },
        { employeeId: { contains: search } },
      ]
    }

    const [drivers, total] = await Promise.all([
      db.driver.findMany({
        where,
        include: {
          trucks: {
            where: { status: 'active' },
            select: { id: true, plateNumber: true, make: true, model: true },
            take: 1,
          },
          user: {
            select: { id: true, email: true, isActive: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.driver.count({ where }),
    ])

    return NextResponse.json({ data: drivers, total, page, limit })
  } catch (error) {
    console.error('Drivers list error:', error)
    return NextResponse.json({ error: 'Failed to fetch drivers' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()

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
      employeeId,
      ghanaCardNumber,
      ghanaCardExpiry,
      photo,
      licenseImage,
      ghanaCardFrontImage,
      ghanaCardBackImage,
      verificationStatus,
      createAccount,
      accountEmail,
      accountPassword,
    } = body

    if (!firstName || !lastName || !phone || !licenseNumber || !licenseExpiry || !licenseClass) {
      return NextResponse.json(
        { error: 'firstName, lastName, phone, licenseNumber, licenseExpiry, and licenseClass are required' },
        { status: 400 }
      )
    }

    // Check for duplicate phone
    const existingPhone = await db.driver.findUnique({ where: { phone } })
    if (existingPhone) {
      return NextResponse.json({ error: 'Driver with this phone number already exists' }, { status: 400 })
    }

    // Check for duplicate license number
    const existingLicense = await db.driver.findUnique({ where: { licenseNumber } })
    if (existingLicense) {
      return NextResponse.json({ error: 'Driver with this license number already exists' }, { status: 400 })
    }

    // Check for duplicate email
    if (email) {
      const existingEmail = await db.driver.findUnique({ where: { email } })
      if (existingEmail) {
        return NextResponse.json({ error: 'Driver with this email already exists' }, { status: 400 })
      }
    }

    // Check for duplicate employeeId
    if (employeeId) {
      const existingEmployeeId = await db.driver.findUnique({ where: { employeeId } })
      if (existingEmployeeId) {
        return NextResponse.json({ error: 'Driver with this employee ID already exists' }, { status: 400 })
      }
    }

    // Auto-generate employee ID if not provided
    let finalEmployeeId = employeeId
    if (!finalEmployeeId) {
      const settings = await db.systemSettings.findFirst()
      const prefix = settings?.driverIdPrefix || 'FP-DRV-'
      const counter = settings?.driverIdCounter || 1
      const padding = settings?.driverIdPadding || 3

      finalEmployeeId = `${prefix}${String(counter).padStart(padding, '0')}`

      // Increment the counter
      if (settings) {
        await db.systemSettings.update({
          where: { id: settings.id },
          data: { driverIdCounter: counter + 1 },
        })
      }
    }

    // Check for duplicate ghanaCardNumber
    if (ghanaCardNumber) {
      const existingGhanaCard = await db.driver.findUnique({ where: { ghanaCardNumber } })
      if (existingGhanaCard) {
        return NextResponse.json({ error: 'Driver with this Ghana Card number already exists' }, { status: 400 })
      }
    }

    // Validate login account fields if creating account
    if (createAccount) {
      if (!accountEmail || !accountEmail.includes('@')) {
        return NextResponse.json({ error: 'A valid account email is required to create a login' }, { status: 400 })
      }
      if (!accountPassword || accountPassword.length < 4) {
        return NextResponse.json({ error: 'Account password must be at least 4 characters' }, { status: 400 })
      }
      // Check if email is already used by another user
      const existingUser = await db.user.findUnique({ where: { email: accountEmail } })
      if (existingUser) {
        return NextResponse.json({ error: 'A user with this email already exists' }, { status: 400 })
      }
    }

    // Find the Driver role for user account creation
    let driverRoleId: string | undefined
    if (createAccount) {
      const driverRole = await db.role.findFirst({ where: { name: 'Driver' } })
      if (!driverRole) {
        return NextResponse.json({ error: 'Driver role not found in system. Please create it first.' }, { status: 400 })
      }
      driverRoleId = driverRole.id
    }

    const driver = await db.driver.create({
      data: {
        firstName,
        lastName,
        phone,
        email,
        licenseNumber,
        licenseExpiry: new Date(licenseExpiry),
        licenseClass,
        emergencyName,
        emergencyPhone,
        address,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        employeeId: finalEmployeeId,
        ghanaCardNumber: ghanaCardNumber || undefined,
        ghanaCardExpiry: ghanaCardExpiry ? new Date(ghanaCardExpiry) : undefined,
        photo: photo || undefined,
        licenseImage: licenseImage || undefined,
        ghanaCardFrontImage: ghanaCardFrontImage || undefined,
        ghanaCardBackImage: ghanaCardBackImage || undefined,
        verificationStatus: verificationStatus || 'pending',
      },
    })

    // Create linked User account if requested
    if (createAccount && driverRoleId) {
      try {
        await db.user.create({
          data: {
            name: `${firstName} ${lastName}`,
            email: accountEmail,
            password: await hashPassword(accountPassword),
            phone,
            roleId: driverRoleId,
            isActive: true,
            driver: { connect: { id: driver.id } },
          },
        })
      } catch (userError) {
        // If user creation fails, we still keep the driver record
        // but log it so the admin knows
        console.error('Failed to create user account for driver:', userError)
      }
    }

    // Audit log: driver created (fire-and-forget)
    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'Driver',
      entityId: driver.id,
      details: { firstName, lastName, accountCreated: !!createAccount },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(driver, { status: 201 })
  } catch (error) {
    console.error('Driver create error:', error)
    return NextResponse.json({ error: 'Failed to create driver' }, { status: 500 })
  }
}
