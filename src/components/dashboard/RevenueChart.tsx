'use client'

import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatShortCurrency } from '@/lib/currency'

interface RevenueData {
  status: string
  amount: number
  count: number
}

interface DashboardData {
  trips: {
    total: number
    pending: number
    inProgress: number
    completed: number
    cancelled: number
  }
  revenue: {
    total: number
    thisMonth: number
  }
}

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const statusColors: Record<string, string> = {
  pending: '#f59e0b',    // amber-500
  in_progress: '#3b82f6', // blue-500
  completed: '#10b981',   // emerald-500
  cancelled: '#ef4444',   // red-500
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: RevenueData }> }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-medium">{statusLabels[data.status] || data.status}</p>
        <p className="text-muted-foreground">{data.count} trip{data.count !== 1 ? 's' : ''}</p>
        <p className="font-semibold text-emerald-600 dark:text-emerald-400">{formatShortCurrency(data.amount)}</p>
      </div>
    )
  }
  return null
}

export function RevenueChart() {
  const { data, isLoading } = useQuery<DashboardData & { recentTrips: Array<{ status: string; totalAmount: number }> }>({
    queryKey: ['dashboard-revenue-chart'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard')
      if (!res.ok) throw new Error('Failed to fetch dashboard data')
      return res.json()
    },
    staleTime: 30_000,
  })

  // Build chart data from dashboard + fetch completed trip amounts
  const { data: allTrips } = useQuery<Array<{ status: string; totalAmount: number }>>({
    queryKey: ['trips-revenue-chart'],
    queryFn: async () => {
      const res = await fetch('/api/trips')
      if (!res.ok) return []
      return res.json()
    },
    staleTime: 30_000,
  })

  const chartData: RevenueData[] = (() => {
    if (!allTrips) return []
    const grouped: Record<string, { amount: number; count: number }> = {}
    for (const trip of allTrips) {
      if (!grouped[trip.status]) grouped[trip.status] = { amount: 0, count: 0 }
      grouped[trip.status].amount += trip.totalAmount
      grouped[trip.status].count += 1
    }
    return Object.entries(grouped).map(([status, val]) => ({
      status,
      amount: val.amount,
      count: val.count,
    }))
  })()

  if (isLoading || !chartData.length) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="p-6">
          <Skeleton className="h-[250px] w-full rounded-lg" />
        </CardContent>
      </Card>
    )
  }

  const maxAmount = Math.max(...chartData.map((d) => d.amount), 1)

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Revenue by Trip Status</CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <XAxis
              dataKey="status"
              tickFormatter={(value) => statusLabels[value] || value}
              tick={{ fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(value) => formatShortCurrency(value)}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={80}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} />
            <Bar dataKey="amount" radius={[6, 6, 0, 0]} maxBarSize={60}>
              {chartData.map((entry) => (
                <Cell key={entry.status} fill={statusColors[entry.status] || '#6b7280'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
