'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Ticket, Plus, Search, Download, Filter, Trash2, Eye,
  Truck, MapPin, AlertTriangle, BarChart3, TrendingUp, ChevronDown,
  X, Calendar, Route, Weight, Receipt, Loader2
} from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import {
  fetchTollRecords, createTollRecord, updateTollRecord, deleteTollRecord,
  fetchTollAnalytics, fetchTrucks, fetchDrivers,
  type TollRecord, type TollAnalytics,
  type Truck, type Driver,
} from '@/lib/api'

// ============ Constants ============

const GHANA_TOLL_POINTS = [
  'Accra-Tema Motorway (Toll Booth 1)',
  'Accra-Tema Motorway (Toll Booth 2)',
  'N1 Accra-Kumasi Toll Plaza',
  'N6 Accra-Cape Coast',
  'Tema-Akosombo Road',
  'Kumasi-Tamale Highway',
  'Takoradi-Tarkwa Road',
  'Aflao Border Checkpoint',
  'Elubo Border Checkpoint',
  'Paga Border Checkpoint',
  'Weighbridge Koforidua',
  'Weighbridge Tema',
  'Weighbridge Kumasi',
]

const TOLL_TYPES = ['toll', 'weighbridge', 'checkpoint', 'parking'] as const
const TOLL_TYPE_LABELS: Record<string, string> = {
  toll: 'Toll',
  weighbridge: 'Weighbridge',
  checkpoint: 'Checkpoint',
  parking: 'Parking',
}
const TOLL_TYPE_COLORS: Record<string, string> = {
  toll: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  weighbridge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  checkpoint: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  parking: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
}
const STATUS_COLORS: Record<string, string> = {
  verified: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  disputed: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  waived: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

function formatCurrency(amount: number) {
  return `${CURRENCY_SYMBOL}${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ============ Component ============

export function TollTrackerView() {
  // Data state
  const [records, setRecords] = useState<TollRecord[]>([])
  const [total, setTotal] = useState(0)
  const [analytics, setAnalytics] = useState<TollAnalytics | null>(null)
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)

  // UI state
  const [page, setPage] = useState(1)
  const [activeTab, setActiveTab] = useState('all')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [showViewDialog, setShowViewDialog] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<TollRecord | null>(null)
  const [creating, setCreating] = useState(false)

  // Filter state
  const [filterTruck, setFilterTruck] = useState('')
  const [filterDriver, setFilterDriver] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterRoute, setFilterRoute] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Form state
  const [form, setForm] = useState({
    truckId: '', driverId: '', tollPoint: '', tollType: 'toll', amount: '',
    paymentMethod: 'cash', tollDate: new Date().toISOString().slice(0, 10),
    route: '', direction: '', referenceNumber: '', location: '', notes: '',
    vehicleWeight: '', overloaded: false, overloadFine: '',
  })

  const limit = 20

  // Fetch toll records
  const loadRecords = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { page, limit }
      if (activeTab !== 'all') params.tollType = activeTab
      if (filterTruck) params.truckId = filterTruck
      if (filterDriver) params.driverId = filterDriver
      if (filterType) params.tollType = filterType
      if (filterStatus) params.status = filterStatus
      if (filterRoute) params.route = filterRoute
      if (filterDateFrom) params.dateFrom = filterDateFrom
      if (filterDateTo) params.dateTo = filterDateTo
      if (searchQuery) params.search = searchQuery

      const res = await fetchTollRecords(params as Parameters<typeof fetchTollRecords>[0])
      setRecords(res.data)
      setTotal(res.total || 0)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load toll records')
    } finally {
      setLoading(false)
    }
  }, [page, activeTab, filterTruck, filterDriver, filterType, filterStatus, filterRoute, filterDateFrom, filterDateTo, searchQuery])

  // Fetch analytics
  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true)
    try {
      const now = new Date()
      const dateFrom = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)
      const dateTo = new Date(now.getFullYear(), 11, 31).toISOString().slice(0, 10)
      const data = await fetchTollAnalytics(dateFrom, dateTo)
      setAnalytics(data)
    } catch (err) {
      console.error(err)
    } finally {
      setAnalyticsLoading(false)
    }
  }, [])

  // Fetch reference data
  useEffect(() => {
    Promise.all([
      fetchTrucks({ limit: 200 }),
      fetchDrivers({ limit: 200 }),
    ]).then(([truckRes, driverRes]) => {
      setTrucks(truckRes.data)
      setDrivers(driverRes.data)
    }).catch(() => {})
  }, [])

  // Load data
  useEffect(() => {
    loadRecords()
    loadAnalytics()
  }, [loadRecords, loadAnalytics])

  // Reset page on filter change
  useEffect(() => { setPage(1) }, [filterTruck, filterDriver, filterType, filterStatus, filterRoute, filterDateFrom, filterDateTo, searchQuery, activeTab])

  // Create toll record
  const handleCreate = async () => {
    if (!form.truckId || !form.tollPoint || !form.amount || !form.tollDate) {
      toast.error('Please fill in truck, toll point, amount, and date')
      return
    }
    setCreating(true)
    try {
      const data: Record<string, unknown> = {
        truckId: form.truckId,
        tollPoint: form.tollPoint,
        tollType: form.tollType,
        amount: parseFloat(form.amount),
        paymentMethod: form.paymentMethod,
        tollDate: form.tollDate,
        route: form.route || null,
        direction: form.direction || null,
        referenceNumber: form.referenceNumber || null,
        location: form.location || null,
        notes: form.notes || null,
        driverId: form.driverId || null,
        overloaded: form.overloaded,
        vehicleWeight: form.vehicleWeight ? parseFloat(form.vehicleWeight) : null,
        overloadFine: form.overloadFine ? parseFloat(form.overloadFine) : null,
      }
      await createTollRecord(data)
      toast.success('Toll record created')
      setShowCreateDialog(false)
      resetForm()
      loadRecords()
      loadAnalytics()
    } catch (err) {
      toast.error('Failed to create toll record')
    } finally {
      setCreating(false)
    }
  }

  // Delete toll record
  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this toll record?')) return
    try {
      await deleteTollRecord(id)
      toast.success('Toll record deleted')
      loadRecords()
      loadAnalytics()
    } catch {
      toast.error('Failed to delete')
    }
  }

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Date', 'Truck', 'Driver', 'Toll Point', 'Type', 'Amount (GHS)', 'Route', 'Status', 'Payment', 'Reference']
    const rows = records.map(r => [
      formatDate(r.tollDate),
      r.truck.plateNumber,
      r.driver ? `${r.driver.firstName} ${r.driver.lastName}` : '',
      r.tollPoint,
      r.tollType,
      r.amount.toFixed(2),
      r.route || '',
      r.status,
      r.paymentMethod,
      r.referenceNumber || '',
    ])
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `toll-records-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exported')
  }

  const resetForm = () => {
    setForm({
      truckId: '', driverId: '', tollPoint: '', tollType: 'toll', amount: '',
      paymentMethod: 'cash', tollDate: new Date().toISOString().slice(0, 10),
      route: '', direction: '', referenceNumber: '', location: '', notes: '',
      vehicleWeight: '', overloaded: false, overloadFine: '',
    })
  }

  const clearFilters = () => {
    setFilterTruck('')
    setFilterDriver('')
    setFilterType('')
    setFilterStatus('')
    setFilterRoute('')
    setFilterDateFrom('')
    setFilterDateTo('')
    setSearchQuery('')
  }

  const totalPages = Math.ceil(total / limit)

  const summary = analytics?.summary

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Ticket className="h-7 w-7 text-emerald-600" />
            Toll Fee & Checkpoint Tracker
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track tolls, weighbridge fees, checkpoints, and parking costs across your fleet
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button size="sm" onClick={() => setShowCreateDialog(true)} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4" />
            Record Toll
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {analyticsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
            <Card className="border-emerald-200 dark:border-emerald-900/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-emerald-600 mb-1">
                  <Receipt className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">Total Tolls (YTD)</span>
                </div>
                <p className="text-2xl font-bold">{formatCurrency(summary?.totalSpend || 0)}</p>
                <p className="text-xs text-muted-foreground">{summary?.recordCount || 0} records</p>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <Card className="border-amber-200 dark:border-amber-900/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-amber-600 mb-1">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">Overload Fines</span>
                </div>
                <p className="text-2xl font-bold">{formatCurrency(summary?.totalFines || 0)}</p>
                <p className="text-xs text-muted-foreground">{summary?.overloadCount || 0} incidents</p>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border-teal-200 dark:border-teal-900/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-teal-600 mb-1">
                  <Route className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">Most Used Route</span>
                </div>
                <p className="text-lg font-bold truncate">{summary?.mostUsedRoute || 'N/A'}</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(summary?.mostUsedRouteSpend || 0)} spent</p>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card className="border-sky-200 dark:border-sky-900/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sky-600 mb-1">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">Avg Per Trip</span>
                </div>
                <p className="text-2xl font-bold">{formatCurrency(summary?.avgPerTrip || 0)}</p>
                <p className="text-xs text-muted-foreground">per trip with tolls</p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}

      {/* Main Content */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Toll Records</CardTitle>
              <CardDescription className="text-xs">{total} total records</CardDescription>
            </div>
            <div className="flex gap-2 items-center">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search toll points..."
                  className="pl-9 h-9 text-sm"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className="gap-1.5">
                <Filter className="h-4 w-4" />
                Filters
                {(filterTruck || filterDriver || filterType || filterStatus || filterRoute || filterDateFrom || filterDateTo) && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs bg-emerald-100 text-emerald-700">1+</Badge>
                )}
              </Button>
            </div>
          </div>

          {/* Filters */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t mt-3">
                  <Select value={filterTruck} onValueChange={v => setFilterTruck(v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All Trucks" /></SelectTrigger>
                    <SelectContent>
                      {trucks.map(t => <SelectItem key={t.id} value={t.id}>{t.plateNumber}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filterDriver} onValueChange={v => setFilterDriver(v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All Drivers" /></SelectTrigger>
                    <SelectContent>
                      {drivers.map(d => <SelectItem key={d.id} value={d.id}>{d.firstName} {d.lastName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filterType} onValueChange={v => setFilterType(v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All Types" /></SelectTrigger>
                    <SelectContent>
                      {TOLL_TYPES.map(t => <SelectItem key={t} value={t}>{TOLL_TYPE_LABELS[t]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filterStatus} onValueChange={v => setFilterStatus(v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="verified">Verified</SelectItem>
                      <SelectItem value="disputed">Disputed</SelectItem>
                      <SelectItem value="waived">Waived</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="text" placeholder="Route" className="h-9 text-sm" value={filterRoute} onChange={e => setFilterRoute(e.target.value)} />
                  <Input type="date" className="h-9 text-sm" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
                  <Input type="date" className="h-9 text-sm" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-xs text-muted-foreground">
                    <X className="h-3.5 w-3.5 mr-1" /> Clear
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardHeader>

        <CardContent className="p-0">
          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="px-4">
            <TabsList className="mb-4 flex-wrap h-auto">
              <TabsTrigger value="all" className="text-xs px-3">All Records</TabsTrigger>
              <TabsTrigger value="toll" className="text-xs px-3">Tolls</TabsTrigger>
              <TabsTrigger value="weighbridge" className="text-xs px-3">Weighbridge</TabsTrigger>
              <TabsTrigger value="checkpoint" className="text-xs px-3">Checkpoints</TabsTrigger>
              <TabsTrigger value="parking" className="text-xs px-3">Parking</TabsTrigger>
              <TabsTrigger value="analytics" className="text-xs px-3"><BarChart3 className="h-3.5 w-3.5 mr-1" />Analytics</TabsTrigger>
            </TabsList>

            {/* Analytics Tab */}
            <TabsContent value="analytics" className="mt-0">
              <TollAnalyticsPanel analytics={analytics} loading={analyticsLoading} />
            </TabsContent>

            {/* Records Tabs */}
            {['all', 'toll', 'weighbridge', 'checkpoint', 'parking'].map(tab => (
              <TabsContent key={tab} value={tab} className="mt-0">
                {loading ? (
                  <div className="py-10 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </div>
                ) : records.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground">
                    <Ticket className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No toll records found</p>
                  </div>
                ) : (
                  <>
                    {/* Desktop Table */}
                    <div className="hidden md:block max-h-[500px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Date</TableHead>
                            <TableHead className="text-xs">Truck</TableHead>
                            <TableHead className="text-xs">Driver</TableHead>
                            <TableHead className="text-xs">Toll Point</TableHead>
                            <TableHead className="text-xs">Type</TableHead>
                            <TableHead className="text-xs text-right">Amount</TableHead>
                            <TableHead className="text-xs">Route</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {records.map(r => (
                            <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setSelectedRecord(r); setShowViewDialog(true) }}>
                              <TableCell className="text-xs py-2.5">{formatDate(r.tollDate)}</TableCell>
                              <TableCell className="text-xs font-medium py-2.5">{r.truck.plateNumber}</TableCell>
                              <TableCell className="text-xs py-2.5">{r.driver ? `${r.driver.firstName} ${r.driver.lastName}` : '—'}</TableCell>
                              <TableCell className="text-xs py-2.5 max-w-[180px] truncate">{r.tollPoint}</TableCell>
                              <TableCell className="py-2.5">
                                <Badge variant="outline" className={`text-xs ${TOLL_TYPE_COLORS[r.tollType] || ''}`}>
                                  {TOLL_TYPE_LABELS[r.tollType] || r.tollType}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs font-semibold text-right py-2.5">{formatCurrency(r.amount)}</TableCell>
                              <TableCell className="text-xs py-2.5 max-w-[120px] truncate">{r.route || '—'}</TableCell>
                              <TableCell className="py-2.5">
                                <Badge variant="outline" className={`text-xs ${STATUS_COLORS[r.status] || ''}`}>
                                  {r.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right py-2.5">
                                <div className="flex gap-1 justify-end" onClick={e => e.stopPropagation()}>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSelectedRecord(r); setShowViewDialog(true) }}>
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => handleDelete(r.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile Cards */}
                    <div className="md:hidden divide-y">
                      {records.map(r => (
                        <div key={r.id} className="mobile-card p-4 space-y-2 cursor-pointer" onClick={() => { setSelectedRecord(r); setShowViewDialog(true) }}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{r.tollPoint}</p>
                              <p className="text-xs text-muted-foreground">{r.truck.plateNumber} &middot; {formatDate(r.tollDate)}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-semibold">{formatCurrency(r.amount)}</p>
                              <Badge variant="outline" className={`text-[10px] ${TOLL_TYPE_COLORS[r.tollType] || ''}`}>
                                {TOLL_TYPE_LABELS[r.tollType]}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {r.driver && <span>{r.driver.firstName} {r.driver.lastName}</span>}
                            {r.route && <span>&middot; {r.route}</span>}
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <Badge variant="outline" className={`text-xs ${STATUS_COLORS[r.status] || ''}`}>{r.status}</Badge>
                            <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                              <Button variant="ghost" size="sm" className="min-h-[44px] text-xs" onClick={() => handleDelete(r.id)}>
                                <Trash2 className="h-3.5 w-3.5 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t">
                        <p className="text-xs text-muted-foreground">
                          Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total}
                        </p>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
                          <span className="flex items-center px-2 text-xs font-medium">{page} / {totalPages}</span>
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Toll Fee</DialogTitle>
            <DialogDescription>Add a new toll, weighbridge fee, checkpoint cost, or parking charge.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Row 1: Truck + Driver */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Truck *</Label>
                <Select value={form.truckId} onValueChange={v => {
                  setForm(f => ({ ...f, truckId: v }))
                  const truck = trucks.find(t => t.id === v)
                  if (truck?.driverId) setForm(f => ({ ...f, driverId: truck.driverId! }))
                }}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select truck" /></SelectTrigger>
                  <SelectContent>
                    {trucks.map(t => <SelectItem key={t.id} value={t.id}>{t.plateNumber} — {t.make} {t.model}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Driver</Label>
                <Select value={form.driverId} onValueChange={v => setForm(f => ({ ...f, driverId: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select driver" /></SelectTrigger>
                  <SelectContent>
                    {drivers.map(d => <SelectItem key={d.id} value={d.id}>{d.firstName} {d.lastName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: Toll Point + Type */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Toll Point *</Label>
                <Select value={form.tollPoint} onValueChange={v => setForm(f => ({ ...f, tollPoint: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select toll point" /></SelectTrigger>
                  <SelectContent>
                    {GHANA_TOLL_POINTS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select value={form.tollType} onValueChange={v => setForm(f => ({ ...f, tollType: v }))}>
                  <SelectTrigger className="h-9 text-sm" />
                  <SelectContent>
                    {TOLL_TYPES.map(t => <SelectItem key={t} value={t}>{TOLL_TYPE_LABELS[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Custom toll point input */}
            {form.tollPoint === '__custom__' && (
              <div className="space-y-1.5">
                <Label className="text-xs">Custom Toll Point Name</Label>
                <Input className="h-9 text-sm" placeholder="Enter toll point name" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
              </div>
            )}

            {/* Row 3: Amount + Payment */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Amount (GHS) *</Label>
                <Input type="number" step="0.01" className="h-9 text-sm" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Payment Method</Label>
                <Select value={form.paymentMethod} onValueChange={v => setForm(f => ({ ...f, paymentMethod: v }))}>
                  <SelectTrigger className="h-9 text-sm" />
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="mobile_money">Mobile Money</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 4: Date + Direction */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Date *</Label>
                <Input type="date" className="h-9 text-sm" value={form.tollDate} onChange={e => setForm(f => ({ ...f, tollDate: e.target.value }))} />
              </div>
              {form.tollType === 'toll' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Direction</Label>
                  <Select value={form.direction} onValueChange={v => setForm(f => ({ ...f, direction: v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inbound">Inbound</SelectItem>
                      <SelectItem value="outbound">Outbound</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.tollType === 'toll' && <div />}
            </div>

            {/* Row 5: Route + Reference */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Route</Label>
                <Input className="h-9 text-sm" placeholder="e.g. Accra - Kumasi" value={form.route} onChange={e => setForm(f => ({ ...f, route: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Receipt / Reference</Label>
                <Input className="h-9 text-sm" placeholder="Receipt number" value={form.referenceNumber} onChange={e => setForm(f => ({ ...f, referenceNumber: e.target.value }))} />
              </div>
            </div>

            {/* Weighbridge Fields */}
            {form.tollType === 'weighbridge' && (
              <div className="space-y-3 p-3 rounded-lg border border-amber-200 dark:border-amber-900/30 bg-amber-50/50 dark:bg-amber-950/10">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <Weight className="h-3.5 w-3.5" />
                  Weighbridge Details
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Vehicle Weight (tonnes)</Label>
                    <Input type="number" step="0.1" className="h-9 text-sm" placeholder="0.0" value={form.vehicleWeight} onChange={e => setForm(f => ({ ...f, vehicleWeight: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5 flex items-end">
                    <div className="flex items-center gap-2">
                      <Checkbox id="overloaded" checked={form.overloaded} onCheckedChange={v => setForm(f => ({ ...f, overloaded: !!v }))} />
                      <Label htmlFor="overloaded" className="text-xs cursor-pointer">Overloaded</Label>
                    </div>
                  </div>
                </div>
                {form.overloaded && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Overload Fine (GHS)</Label>
                    <Input type="number" step="0.01" className="h-9 text-sm" placeholder="0.00" value={form.overloadFine} onChange={e => setForm(f => ({ ...f, overloadFine: e.target.value }))} />
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea className="text-sm min-h-[60px]" placeholder="Optional notes..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="text-sm">Cancel</Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-emerald-600 hover:bg-emerald-700 text-sm">
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Record Toll
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Detail Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Toll Record Detail</DialogTitle>
          </DialogHeader>
          {selectedRecord && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground text-xs">Date</span><p className="font-medium">{formatDate(selectedRecord.tollDate)}</p></div>
                <div><span className="text-muted-foreground text-xs">Amount</span><p className="font-bold text-lg">{formatCurrency(selectedRecord.amount)}</p></div>
                <div><span className="text-muted-foreground text-xs">Truck</span><p className="font-medium">{selectedRecord.truck.plateNumber}</p></div>
                <div><span className="text-muted-foreground text-xs">Driver</span><p className="font-medium">{selectedRecord.driver ? `${selectedRecord.driver.firstName} ${selectedRecord.driver.lastName}` : '—'}</p></div>
                <div className="col-span-2"><span className="text-muted-foreground text-xs">Toll Point</span><p className="font-medium">{selectedRecord.tollPoint}</p></div>
                <div><span className="text-muted-foreground text-xs">Type</span><p><Badge variant="outline" className={TOLL_TYPE_COLORS[selectedRecord.tollType]}>{TOLL_TYPE_LABELS[selectedRecord.tollType]}</Badge></p></div>
                <div><span className="text-muted-foreground text-xs">Status</span><p><Badge variant="outline" className={STATUS_COLORS[selectedRecord.status]}>{selectedRecord.status}</Badge></p></div>
                {selectedRecord.route && <div className="col-span-2"><span className="text-muted-foreground text-xs">Route</span><p>{selectedRecord.route}</p></div>}
                {selectedRecord.direction && <div><span className="text-muted-foreground text-xs">Direction</span><p>{selectedRecord.direction}</p></div>}
                <div><span className="text-muted-foreground text-xs">Payment</span><p>{selectedRecord.paymentMethod}</p></div>
                {selectedRecord.referenceNumber && <div><span className="text-muted-foreground text-xs">Reference</span><p>{selectedRecord.referenceNumber}</p></div>}
                {selectedRecord.tollType === 'weighbridge' && selectedRecord.vehicleWeight && (
                  <div><span className="text-muted-foreground text-xs">Vehicle Weight</span><p>{selectedRecord.vehicleWeight} tonnes</p></div>
                )}
                {selectedRecord.overloaded && (
                  <div><span className="text-muted-foreground text-xs">Overloaded</span><p className="text-red-600 font-medium">Yes — Fine: {formatCurrency(selectedRecord.overloadFine || 0)}</p></div>
                )}
                {selectedRecord.notes && <div className="col-span-2"><span className="text-muted-foreground text-xs">Notes</span><p className="text-sm">{selectedRecord.notes}</p></div>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============ Analytics Sub-panel ============

function TollAnalyticsPanel({ analytics, loading }: { analytics: TollAnalytics | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="py-10 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
      </div>
    )
  }

  if (!analytics) return <p className="text-center text-muted-foreground py-10">No analytics data available.</p>

  const maxMonthly = Math.max(...(analytics.monthlyTrend?.map(m => m.total) || [1]), 1)
  const maxRouteSpend = Math.max(...(analytics.spendByRoute?.map(r => r._sum.amount) || [1]), 1)

  return (
    <div className="space-y-6 pb-4">
      {/* Monthly Trend Bar Chart */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Monthly Toll Spend</h3>
        {analytics.monthlyTrend.length === 0 ? (
          <p className="text-xs text-muted-foreground">No monthly data available.</p>
        ) : (
          <div className="space-y-2">
            {analytics.monthlyTrend.map(m => {
              const pct = (m.total / maxMonthly) * 100
              return (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="text-xs w-16 shrink-0 text-muted-foreground">{m.month}</span>
                  <div className="flex-1 bg-muted rounded-full h-6 relative overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(pct, 2)}%` }}
                      className="absolute inset-y-0 left-0 bg-emerald-500 rounded-full"
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                    <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-white truncate">{formatCurrency(m.total)}</span>
                  </div>
                  <span className="text-xs w-12 text-right text-muted-foreground">{m.count} txns</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Route Breakdown */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Spend by Route</h3>
        {analytics.spendByRoute.length === 0 ? (
          <p className="text-xs text-muted-foreground">No route data available.</p>
        ) : (
          <div className="space-y-2">
            {analytics.spendByRoute.slice(0, 8).map(r => {
              const pct = (r._sum.amount / maxRouteSpend) * 100
              return (
                <div key={r.route} className="flex items-center gap-3">
                  <span className="text-xs flex-1 truncate max-w-[180px]">{r.route}</span>
                  <div className="w-40 bg-muted rounded-full h-5 relative overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-teal-500 rounded-full" style={{ width: `${Math.max(pct, 2)}%` }} />
                    <span className="absolute inset-0 flex items-center px-2 text-[10px] font-medium text-white truncate">{formatCurrency(r._sum.amount)}</span>
                  </div>
                  <span className="text-xs w-8 text-right text-muted-foreground">{r._count}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Top Toll Points Table */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Top Toll Points by Cost</h3>
        {analytics.topTollPoints.length === 0 ? (
          <p className="text-xs text-muted-foreground">No toll point data.</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Toll Point</TableHead>
                  <TableHead className="text-xs text-right">Total Spent</TableHead>
                  <TableHead className="text-xs text-right">Records</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.topTollPoints.slice(0, 10).map(p => (
                  <TableRow key={p.tollPoint}>
                    <TableCell className="text-xs py-2">{p.tollPoint}</TableCell>
                    <TableCell className="text-xs font-semibold text-right py-2">{formatCurrency(p.totalSpend)}</TableCell>
                    <TableCell className="text-xs text-right py-2">{p.recordCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Truck Comparison */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Truck Comparison</h3>
        {analytics.spendByTruck.length === 0 ? (
          <p className="text-xs text-muted-foreground">No truck data.</p>
        ) : (
          <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Truck</TableHead>
                  <TableHead className="text-xs text-right">Total Spent</TableHead>
                  <TableHead className="text-xs text-right">Fines</TableHead>
                  <TableHead className="text-xs text-right">Records</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.spendByTruck.map(t => (
                  <TableRow key={t.truckId}>
                    <TableCell className="text-xs font-medium py-2">{t.plateNumber}</TableCell>
                    <TableCell className="text-xs font-semibold text-right py-2">{formatCurrency(t.totalSpend)}</TableCell>
                    <TableCell className="text-xs text-right py-2 text-amber-600">{t.totalFines > 0 ? formatCurrency(t.totalFines) : '—'}</TableCell>
                    <TableCell className="text-xs text-right py-2">{t.recordCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Spend by Type */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Spend by Type</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {analytics.spendByType.map(t => (
            <Card key={t.type} className="p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <div className={`h-2.5 w-2.5 rounded-full ${TOLL_TYPE_COLORS[t.type]?.split(' ')[0] || 'bg-gray-400'}`} />
                <span className="text-xs text-muted-foreground">{TOLL_TYPE_LABELS[t.type] || t.type}</span>
              </div>
              <p className="text-sm font-bold">{formatCurrency(t.totalSpend)}</p>
              <p className="text-xs text-muted-foreground">{t.recordCount} records</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
