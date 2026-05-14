import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchTripSummaryData, fetchFuelReportData, fetchExpenseReportData, fetchDailySummaryData } from '@/lib/reports/report-data'
import { buildCsv, generateReportFilename } from '@/lib/reports/csv-generator'

export async function POST(request: NextRequest) {
  // Auth via CRON_SECRET for automated access
  const cronSecret = request.headers.get('x-cron-secret')
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized. Valid CRON_SECRET header required.' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const dateStr = (body as { date?: string }).date || new Date().toISOString().split('T')[0]
    const date = new Date(dateStr)

    // Fetch summary data
    const [tripData, fuelData, expenseData, dailyData] = await Promise.all([
      fetchTripSummaryData({ dateFrom: dateStr, dateTo: dateStr }),
      fetchFuelReportData({ dateFrom: dateStr, dateTo: dateStr }),
      fetchExpenseReportData({ dateFrom: dateStr, dateTo: dateStr }),
      fetchDailySummaryData(dateStr),
    ])

    // Build combined CSV
    const allHeaders = ['Section', 'Metric', 'Value']
    const allRows: (string | number | null | undefined)[][] = [
      // Trip summary
      ['Trips', 'Total Trips', tripData.rows.length],
      ['Trips', 'Completed', tripData.rows.filter((r) => r[7] === 'Completed').length],
      // ... more metrics from dailyData
      ...dailyData.rows.map((row) => ['Summary', row[0], row[1]]),
      // Fuel summary
      ['Fuel', 'Total Fill-ups', fuelData.rows.length],
      ['Fuel', 'Total Liters', fuelData.rows.reduce((sum, r) => sum + (Number(r[4]) || 0), 0).toFixed(1)],
      // Expense summary
      ['Expenses', 'Total Entries', expenseData.rows.length],
      ['Expenses', 'Total Amount (GHS)', expenseData.rows.reduce((sum, r) => sum + (Number(r[6]) || 0), 0).toFixed(2)],
    ]

    const csvContent = buildCsv(allHeaders, allRows)
    const fileSize = Buffer.byteLength(csvContent, 'utf-8')

    // Save report history
    await db.reportHistory.create({
      data: {
        type: 'daily_summary',
        title: `Daily Summary - ${dateStr}`,
        format: 'csv',
        parameters: JSON.stringify({ date: dateStr }),
        generatedBy: 'system-cron',
        fileSize,
        status: 'completed',
      },
    })

    // Try to dispatch notification to admins
    try {
      const { dispatchNotification } = await import('@/lib/services/notification-dispatcher')
      const admins = await db.user.findMany({
        where: {
          role: { name: { in: ['Admin', 'Manager'] } },
          isActive: true,
        },
        include: { role: true },
      })

      const tripCount = tripData.rows.length
      const totalExpenses = expenseData.rows.reduce((sum, r) => sum + (Number(r[6]) || 0), 0)

      await Promise.allSettled(
        admins.map((admin) =>
          dispatchNotification({
            userId: admin.id,
            type: 'daily_report',
            title: `Daily Summary — ${dateStr}`,
            message: `${tripCount} trips completed, ${totalExpenses.toFixed(2)} GHS in expenses. Report generated and saved.`,
            channels: ['in_app'],
          })
        )
      )
    } catch (notifError) {
      console.error('[DailySummary] Notification dispatch failed:', notifError)
    }

    return NextResponse.json({
      success: true,
      date: dateStr,
      trips: tripData.rows.length,
      fuelEntries: fuelData.rows.length,
      expenses: expenseData.rows.length,
      fileSize,
    })
  } catch (error) {
    console.error('[DailySummary] Generation failed:', error)

    try {
      await db.reportHistory.create({
        data: {
          type: 'daily_summary',
          title: 'Daily Summary (Failed)',
          format: 'csv',
          generatedBy: 'system-cron',
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      })
    } catch {
      // ignore
    }

    return NextResponse.json({ error: 'Failed to generate daily summary' }, { status: 500 })
  }
}
