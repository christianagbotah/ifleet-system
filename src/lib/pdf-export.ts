/**
 * PDF report export utility for iFleetPro financial reports.
 * Uses the browser print API with a hidden container styled for A4 PDF output.
 */

import { formatCurrency } from '@/lib/currency'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ReportData {
  financialSummary: {
    totalRevenue: number
    totalCashAdvances: number
    totalIncentives: number
    netIncome: number
    completedTripsRevenue: number
    pendingTripsRevenue: number
    pendingCashAdvances: number
    pendingIncentives: number
  }
  driverPerformance: Array<{
    driverId: string
    driverName: string
    totalTrips: number
    completedTrips: number
    totalDistance: number
    totalRevenue: number
    totalFuelUsed: number
    avgRevenuePerTrip: number
    avgDistancePerTrip: number
    fuelEfficiency: number
  }>
  truckUtilization: Array<{
    truckId: string
    plateNumber: string
    truckName: string
    totalTrips: number
    totalDistance: number
    totalRevenue: number
    activeDays: number
  }>
  monthlyRevenue: Array<{
    month: string
    revenue: number
    trips: number
    expenses: number
  }>
  tripStatusBreakdown: {
    pending: number
    in_progress: number
    completed: number
    cancelled: number
  }
  cargoStats: {
    totalWeight: number
    avgWeightPerTrip: number
    mostCommonCargo: string
  }
  generatedAt?: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getCompanyName(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('ifleetpro-company-name') || ''
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMonthLabel(monthStr: string): string {
  const [year, month] = monthStr.split('-')
  return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  })
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

// ─── Inline Styles (for consistent print rendering) ─────────────────────────

const S = {
  page: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#1a1a1a',
    lineHeight: '1.5',
    fontSize: '11px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottom: '2px solid #1a1a1a',
    paddingBottom: '16px',
    marginBottom: '24px',
  },
  brand: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1a1a1a',
    margin: '0',
  },
  brandSub: {
    fontSize: '12px',
    color: '#666',
    margin: '2px 0 0 0',
  },
  headerRight: {
    textAlign: 'right' as const,
  },
  reportTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1a1a1a',
    margin: '0 0 2px 0',
  },
  headerDate: {
    fontSize: '10px',
    color: '#888',
    margin: '0',
  },
  companyName: {
    fontSize: '10px',
    color: '#666',
    margin: '4px 0 0 0',
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#1a1a1a',
    margin: '24px 0 12px 0',
    paddingBottom: '6px',
    borderBottom: '1px solid #e0e0e0',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr 1fr',
    gap: '12px',
    marginBottom: '8px',
  },
  summaryCard: {
    border: '1px solid #e0e0e0',
    borderRadius: '6px',
    padding: '12px',
    backgroundColor: '#fafafa',
  },
  summaryLabel: {
    fontSize: '9px',
    fontWeight: '500',
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    margin: '0 0 4px 0',
  },
  summaryValue: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#1a1a1a',
    margin: '0',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    marginBottom: '16px',
    fontSize: '11px',
  },
  th: {
    backgroundColor: '#f5f5f5',
    fontWeight: '600',
    color: '#1a1a1a',
    padding: '8px 10px',
    textAlign: 'left' as const,
    borderBottom: '2px solid #ddd',
    fontSize: '10px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  thRight: {
    textAlign: 'right' as const,
  },
  thCenter: {
    textAlign: 'center' as const,
  },
  td: {
    padding: '7px 10px',
    borderBottom: '1px solid #eee',
    color: '#333',
  },
  tdRight: {
    padding: '7px 10px',
    borderBottom: '1px solid #eee',
    color: '#333',
    textAlign: 'right' as const,
  },
  tdCenter: {
    padding: '7px 10px',
    borderBottom: '1px solid #eee',
    color: '#333',
    textAlign: 'center' as const,
  },
  rowEven: {
    backgroundColor: '#fafafa',
  },
  footer: {
    marginTop: '32px',
    paddingTop: '12px',
    borderTop: '1px solid #ddd',
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '9px',
    color: '#999',
  },
  pageBreak: {
    pageBreakBefore: 'always' as const,
  },
  revenuePositive: {
    color: '#059669',
    fontWeight: '600' as const,
  },
  revenueNegative: {
    color: '#dc2626',
    fontWeight: '600' as const,
  },
  statusDot: {
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    marginRight: '6px',
    verticalAlign: 'middle',
  },
  rank: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    backgroundColor: '#f0f0f0',
    fontWeight: '700',
    fontSize: '10px',
    color: '#666',
  },
  rankGold: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    backgroundColor: '#fef3c7',
    fontWeight: '700',
    fontSize: '10px',
    color: '#92400e',
  },
  rankSilver: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    backgroundColor: '#f1f5f9',
    fontWeight: '700',
    fontSize: '10px',
    color: '#475569',
  },
  rankBronze: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    backgroundColor: '#fed7aa',
    fontWeight: '700',
    fontSize: '10px',
    color: '#9a3412',
  },
}

// ─── HTML Builders ───────────────────────────────────────────────────────────

function buildHeader(data: ReportData): string {
  const companyName = getCompanyName()
  const now = new Date()
  return `
    <div style="${styleStr(S.header)}">
      <div>
        <h1 style="${styleStr(S.brand)}">iFleetPro</h1>
        <p style="${styleStr(S.brandSub)}">Fleet Management System</p>
        ${companyName ? `<p style="${styleStr(S.companyName)}">${escHtml(companyName)}</p>` : ''}
      </div>
      <div style="${styleStr(S.headerRight)}">
        <p style="${styleStr(S.reportTitle)}">Financial Report</p>
        <p style="${styleStr(S.headerDate)}">${formatDate(now)}</p>
      </div>
    </div>`
}

function buildExecutiveSummary(data: ReportData): string {
  const { financialSummary: fs } = data
  const totalExpenses = fs.pendingCashAdvances + fs.pendingIncentives
  const totalTrips = Object.values(data.tripStatusBreakdown).reduce((a, b) => a + b, 0)

  const cards = [
    { label: 'Total Revenue', value: formatCurrency(fs.totalRevenue) },
    { label: 'Total Trips', value: totalTrips.toString() },
    { label: 'Total Expenses', value: formatCurrency(totalExpenses), sub: 'Pending CA + Incentives' },
    { label: 'Net Revenue', value: formatCurrency(fs.totalRevenue - totalExpenses) },
  ]

  return `
    <h2 style="${styleStr(S.sectionTitle)}">Executive Summary</h2>
    <div style="${styleStr(S.summaryGrid)}">
      ${cards.map((c) => `
        <div style="${styleStr(S.summaryCard)}">
          <p style="${styleStr(S.summaryLabel)}">${c.label}</p>
          <p style="${styleStr(S.summaryValue)}">${escHtml(c.value)}</p>
          ${c.sub ? `<p style="font-size:9px;color:#999;margin:2px 0 0 0">${escHtml(c.sub)}</p>` : ''}
        </div>
      `).join('')}
    </div>`
}

function buildRevenueByMonth(data: ReportData): string {
  const sorted = [...data.monthlyRevenue].sort((a, b) => a.month.localeCompare(b.month))

  return `
    <h2 style="${styleStr(S.sectionTitle)}">Revenue by Month</h2>
    <table style="${styleStr(S.table)}">
      <thead>
        <tr>
          <th style="${styleStr(S.th)}">Month</th>
          <th style="${styleStr({...S.th, textAlign: 'center'})}">Trips</th>
          <th style="${styleStr({...S.th, textAlign: 'right'})}">Revenue</th>
          <th style="${styleStr({...S.th, textAlign: 'right'})}">Expenses</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map((m, i) => `
          <tr style="${i % 2 === 1 ? styleStr(S.rowEven) : ''}">
            <td style="${styleStr(S.td)}">${escHtml(formatMonthLabel(m.month))}</td>
            <td style="${styleStr(S.tdCenter)}">${m.trips}</td>
            <td style="${styleStr(S.tdRight)}">${formatCurrency(m.revenue)}</td>
            <td style="${styleStr(S.tdRight)}">${formatCurrency(m.expenses)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  in_progress: '#3b82f6',
  completed: '#10b981',
  cancelled: '#ef4444',
}

function buildTripStatusDistribution(data: ReportData): string {
  const entries = Object.entries(data.tripStatusBreakdown)
    .filter(([, count]) => count > 0)

  // Calculate revenue per status from driver/truck data (approximate from trips)
  // We'll show count only since status-level revenue isn't directly in the data
  const totalTrips = entries.reduce((a, [, c]) => a + c, 0)

  return `
    <h2 style="${styleStr(S.sectionTitle)}">Trip Status Distribution</h2>
    <table style="${styleStr(S.table)}">
      <thead>
        <tr>
          <th style="${styleStr(S.th)}">Status</th>
          <th style="${styleStr({...S.th, textAlign: 'center'})}">Count</th>
          <th style="${styleStr({...S.th, textAlign: 'right'})}">Percentage</th>
        </tr>
      </thead>
      <tbody>
        ${entries.map(([key, count], i) => {
          const pct = totalTrips > 0 ? ((count / totalTrips) * 100).toFixed(1) : '0.0'
          const color = STATUS_COLORS[key] || '#6b7280'
          return `
            <tr style="${i % 2 === 1 ? styleStr(S.rowEven) : ''}">
              <td style="${styleStr(S.td)}">
                <span style="${styleStr({...S.statusDot, backgroundColor: color})}"></span>
                ${escHtml(STATUS_LABELS[key] || key)}
              </td>
              <td style="${styleStr(S.tdCenter)}">${count}</td>
              <td style="${styleStr(S.tdRight)}">${pct}%</td>
            </tr>`
        }).join('')}
      </tbody>
    </table>`
}

function buildTopDrivers(data: ReportData): string {
  const sorted = [...data.driverPerformance]
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 10)

  const getRankStyle = (idx: number) => {
    if (idx === 0) return S.rankGold
    if (idx === 1) return S.rankSilver
    if (idx === 2) return S.rankBronze
    return S.rank
  }

  return `
    <h2 style="${styleStr(S.sectionTitle)}">Top Drivers by Revenue</h2>
    <table style="${styleStr(S.table)}">
      <thead>
        <tr>
          <th style="${styleStr({...S.th, textAlign: 'center', width: '50px'})}">Rank</th>
          <th style="${styleStr(S.th)}">Driver</th>
          <th style="${styleStr({...S.th, textAlign: 'center'})}">Trips</th>
          <th style="${styleStr({...S.th, textAlign: 'center'})}">Distance</th>
          <th style="${styleStr({...S.th, textAlign: 'right'})}">Revenue</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map((d, i) => `
          <tr style="${i % 2 === 1 ? styleStr(S.rowEven) : ''}">
            <td style="${styleStr({...S.tdCenter, verticalAlign: 'middle'})}">
              <span style="${styleStr(getRankStyle(i))}">${i + 1}</span>
            </td>
            <td style="${styleStr({...S.td, fontWeight: '500'})}">${escHtml(d.driverName)}</td>
            <td style="${styleStr(S.tdCenter)}">${d.totalTrips}</td>
            <td style="${styleStr(S.tdCenter)}">${d.totalDistance.toLocaleString()} km</td>
            <td style="${styleStr(S.tdRight)}">${formatCurrency(d.totalRevenue)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`
}

function buildTopTrucks(data: ReportData): string {
  const sorted = [...data.truckUtilization]
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 10)

  const getRankStyle = (idx: number) => {
    if (idx === 0) return S.rankGold
    if (idx === 1) return S.rankSilver
    if (idx === 2) return S.rankBronze
    return S.rank
  }

  return `
    <h2 style="${styleStr(S.sectionTitle)}">Top Trucks by Revenue</h2>
    <table style="${styleStr(S.table)}">
      <thead>
        <tr>
          <th style="${styleStr({...S.th, textAlign: 'center', width: '50px'})}">Rank</th>
          <th style="${styleStr(S.th)}">Truck</th>
          <th style="${styleStr({...S.th})}">Plate Number</th>
          <th style="${styleStr({...S.th, textAlign: 'center'})}">Trips</th>
          <th style="${styleStr({...S.th, textAlign: 'right'})}">Revenue</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map((t, i) => `
          <tr style="${i % 2 === 1 ? styleStr(S.rowEven) : ''}">
            <td style="${styleStr({...S.tdCenter, verticalAlign: 'middle'})}">
              <span style="${styleStr(getRankStyle(i))}">${i + 1}</span>
            </td>
            <td style="${styleStr({...S.td, fontWeight: '500'})}">${escHtml(t.truckName)}</td>
            <td style="${styleStr({...S.td, fontFamily: 'monospace', fontSize: '10px'})}">${escHtml(t.plateNumber)}</td>
            <td style="${styleStr(S.tdCenter)}">${t.totalTrips}</td>
            <td style="${styleStr(S.tdRight)}">${formatCurrency(t.totalRevenue)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`
}

function buildFooter(): string {
  const now = new Date()
  return `
    <div style="${styleStr(S.footer)}">
      <span>Generated by iFleetPro Fleet Management System</span>
      <span>${formatDate(now)}</span>
    </div>`
}

// ─── Utility ────────────────────────────────────────────────────────────────

function styleStr(styles: Record<string, unknown>): string {
  return Object.entries(styles)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${camelToKebab(k)}: ${v}`)
    .join('; ')
}

function camelToKebab(str: string): string {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase()
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Generates the full HTML for the financial report PDF.
 * This is designed to be injected into a hidden div and printed via window.print().
 */
export function buildReportHtml(data: ReportData): string {
  return `
    <div style="${styleStr(S.page)}">
      ${buildHeader(data)}
      ${buildExecutiveSummary(data)}
      <div style="${styleStr(S.pageBreak)}"></div>
      ${buildRevenueByMonth(data)}
      ${buildTripStatusDistribution(data)}
      <div style="${styleStr(S.pageBreak)}"></div>
      ${buildTopDrivers(data)}
      ${buildTopTrucks(data)}
      ${buildFooter()}
    </div>`
}
