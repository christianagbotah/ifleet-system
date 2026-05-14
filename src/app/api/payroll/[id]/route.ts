import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, ROLES } from '@/lib/auth-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const { id } = await params

    const payroll = await db.payroll.findUnique({
      where: { id },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, phone: true, status: true } },
      },
    })

    if (!payroll) {
      return NextResponse.json({ error: 'Payroll record not found' }, { status: 404 })
    }

    return NextResponse.json(payroll)
  } catch (error) {
    console.error('Payroll detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch payroll record' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const { id } = await params
    const body = await request.json()

    const payroll = await db.payroll.findUnique({ where: { id } })
    if (!payroll) {
      return NextResponse.json({ error: 'Payroll record not found' }, { status: 404 })
    }

    const {
      baseSalary,
      tripBonus,
      overtimePay,
      deductions,
      netPay,
      status,
      approvedBy,
      notes,
    } = body

    // Recalculate netPay if individual components change
    const parsedBaseSalary = baseSalary !== undefined ? parseFloat(baseSalary) : payroll.baseSalary
    const parsedTripBonus = tripBonus !== undefined ? parseFloat(tripBonus || 0) : payroll.tripBonus
    const parsedOvertimePay = overtimePay !== undefined ? parseFloat(overtimePay || 0) : payroll.overtimePay
    const parsedDeductions = deductions !== undefined ? parseFloat(deductions || 0) : payroll.deductions

    const recalcNetPay = parsedBaseSalary + parsedTripBonus + parsedOvertimePay - parsedDeductions

    let paidAt: Date | undefined
    if (status === 'paid' && payroll.status !== 'paid') {
      paidAt = new Date()
    }

    const updatedPayroll = await db.payroll.update({
      where: { id },
      data: {
        baseSalary: parsedBaseSalary,
        tripBonus: parsedTripBonus,
        overtimePay: parsedOvertimePay,
        deductions: parsedDeductions,
        netPay: netPay !== undefined ? parseFloat(netPay) : recalcNetPay,
        ...(status !== undefined && { status }),
        ...(approvedBy !== undefined && { approvedBy }),
        ...(notes !== undefined && { notes }),
        ...(paidAt && { paidAt }),
      },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, phone: true, status: true } },
      },
    })

    return NextResponse.json(updatedPayroll)
  } catch (error) {
    console.error('Payroll update error:', error)
    return NextResponse.json({ error: 'Failed to update payroll record' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const { id } = await params

    const payroll = await db.payroll.findUnique({ where: { id } })
    if (!payroll) {
      return NextResponse.json({ error: 'Payroll record not found' }, { status: 404 })
    }

    if (payroll.status === 'paid') {
      return NextResponse.json(
        { error: 'Cannot delete a paid payroll record' },
        { status: 400 }
      )
    }

    await db.payroll.delete({ where: { id } })

    return NextResponse.json({ message: 'Payroll record deleted successfully' })
  } catch (error) {
    console.error('Payroll delete error:', error)
    return NextResponse.json({ error: 'Failed to delete payroll record' }, { status: 500 })
  }
}
