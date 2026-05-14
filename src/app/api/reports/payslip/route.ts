import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { buildPayslipPdf } from '@/lib/reports/payslip-pdf'

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const payrollId = searchParams.get('payrollId')

  if (!payrollId) {
    return NextResponse.json({ error: 'payrollId is required' }, { status: 400 })
  }

  try {
    // Verify payroll exists
    const payroll = await db.payroll.findUnique({
      where: { id: payrollId },
      include: { driver: true },
    })

    if (!payroll) {
      return NextResponse.json({ error: 'Payroll record not found' }, { status: 404 })
    }

    const pdf = await buildPayslipPdf(payrollId)
    const buffer = pdf.toBuffer()

    // Save report history
    await db.reportHistory.create({
      data: {
        type: 'payroll_report',
        title: `Payslip - ${payroll.driver?.name || 'Unknown'}`,
        format: 'pdf',
        parameters: JSON.stringify({ payrollId }),
        generatedBy: auth.email,
        fileSize: buffer.length,
        status: 'completed',
      },
    })

    const filename = `payslip_${payroll.driver?.name?.replace(/\s+/g, '_') || payrollId}_${new Date().toISOString().split('T')[0]}.pdf`

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch (error) {
    console.error('[Reports] Payslip generation failed:', error)
    return NextResponse.json({ error: 'Failed to generate payslip' }, { status: 500 })
  }
}
