'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  ClipboardCheck, Plus, Search, Filter, CheckCircle, AlertTriangle, XCircle,
  Truck, User, Calendar, MapPin, FileText, Loader2, ChevronLeft, ChevronRight,
  Eye, Trash2, CheckSquare, X, ArrowUpCircle, ArrowDownCircle,
  Shield, Lightbulb, Cog, Disc, Wrench, Car
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  fetchInspections, fetchInspectionSummary, fetchInspection,
  createInspection, updateInspection, deleteInspection,
  fetchTrucks, fetchDrivers,
  type VehicleInspection, type InspectionSummary, type CheckItem, type Truck, type Driver,
} from '@/lib/api'
import { useEntityHighlight } from '@/lib/hooks/useEntityHighlight'

// ============ CHECK ITEMS TEMPLATE ============

const INSPECTION_CATEGORIES = [
  {
    name: 'Safety',
    icon: Shield,
    items: ['Fire extinguisher', 'First aid kit', 'Warning triangles', 'Seat belts', 'Mirror condition'],
  },
  {
    name: 'Lights',
    icon: Lightbulb,
    items: ['Headlights', 'Brake lights', 'Indicators', 'Hazard lights', 'Reverse lights'],
  },
  {
    name: 'Engine',
    icon: Cog,
    items: ['Oil level', 'Coolant level', 'Battery', 'Belt condition'],
  },
  {
    name: 'Tyres',
    icon: Disc,
    items: ['Tyre tread depth', 'Tyre pressure', 'Spare tyre'],
  },
  {
    name: 'Brakes',
    icon: Wrench,
    items: ['Brake pedal', 'Air pressure'],
  },
  {
    name: 'Body',
    icon: Car,
    items: ['Windshield', 'Load securing equipment', 'Overall condition'],
  },
  {
    name: 'Documents',
    icon: FileText,
    items: ['Insurance certificate', 'Roadworthy certificate'],
  },
]

function getDefaultCheckItems(type: string): CheckItem[] {
  const items: CheckItem[] = []
  for (const cat of INSPECTION_CATEGORIES) {
    // Roadworthy certificate only for pre-trip
    const filtered = cat.items.filter(item => {
      if (item === 'Roadworthy certificate' && type === 'post_trip') return false
      return true
    })
    for (const name of filtered) {
      items.push({ name, category: cat.name, status: 'ok', notes: '', severity: 'low' })
    }
  }
  return items
}

// ============ RESULT BADGE ============

function ResultBadge({ result }: { result: string }) {
  if (result === 'pass') {
    return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Pass</Badge>
  }
  if (result === 'conditional_pass') {
    return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Conditional</Badge>
  }
  return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Fail</Badge>
}

// ============ STATUS ICON ============

function StatusIcon({ status }: { status: string }) {
  if (status === 'ok') return <CheckCircle className="h-4 w-4 text-emerald-500" />
  if (status === 'warning') return <AlertTriangle className="h-4 w-4 text-amber-500" />
  return <XCircle className="h-4 w-4 text-red-500" />
}

// ============ MAIN VIEW ============

export function VehicleInspectionsView() {
  const [inspections, setInspections] = useState<VehicleInspection[]>([])
  const [summary, setSummary] = useState<InspectionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [detailInspection, setDetailInspection] = useState<VehicleInspection | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const { highlightEntityId, highlightClassName, scrollIntoView } = useEntityHighlight('vehicleinspection')
  const rowRefs = useRef<Record<string, HTMLElement | null>>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { page, limit: 20 }
      if (activeTab === 'pre_trip') params.type = 'pre_trip'
      if (activeTab === 'post_trip') params.type = 'post_trip'
      if (activeTab === 'failed') params.result = 'fail'
      if (searchQuery) params.truckId = searchQuery

      const [res, sum] = await Promise.all([
        fetchInspections(params as Parameters<typeof fetchInspections>[0]),
        fetchInspectionSummary(),
      ])
      setInspections(res.data || [])
      setTotalPages(Math.ceil((res.total || 0) / 20))
      setSummary(sum)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load inspections')
    } finally {
      setLoading(false)
    }
  }, [page, activeTab, searchQuery])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Scroll to highlighted row after data loads
  useEffect(() => {
    if (highlightEntityId && rowRefs.current[highlightEntityId]) {
      scrollIntoView(rowRefs.current[highlightEntityId])
    }
  }, [highlightEntityId, inspections, scrollIntoView])

  const handleOpenDetail = async (id: string) => {
    setDetailLoading(true)
    try {
      const insp = await fetchInspection(id)
      setDetailInspection(insp)
    } catch {
      toast.error('Failed to load inspection details')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this inspection?')) return
    try {
      await deleteInspection(id)
      toast.success('Inspection deleted')
      loadData()
      setDetailInspection(null)
    } catch {
      toast.error('Failed to delete inspection')
    }
  }

  const handleCompleteFollowUp = async (id: string) => {
    try {
      await updateInspection(id, { followUpCompleted: true })
      toast.success('Follow-up marked complete')
      setDetailInspection(null)
      loadData()
    } catch {
      toast.error('Failed to update follow-up')
    }
  }

  const resultFilter = (activeTab === 'failed') ? 'fail' : undefined

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-orange-500" />
            Vehicle Inspections
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Pre-trip and post-trip inspection records</p>
        </div>
        <Button onClick={() => setFormOpen(true)} className="bg-orange-600 hover:bg-orange-700 text-white">
          <Plus className="h-4 w-4 mr-2" />
          New Inspection
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <ClipboardCheck className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summary.thisMonth.total}</p>
                  <p className="text-xs text-muted-foreground">This Month</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${summary.thisMonth.passRate >= 80 ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                  {summary.thisMonth.passRate >= 80
                    ? <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    : <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />}
                </div>
                <div>
                  <p className="text-2xl font-bold">{summary.thisMonth.passRate}%</p>
                  <p className="text-xs text-muted-foreground">Pass Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summary.thisMonth.defects}</p>
                  <p className="text-xs text-muted-foreground">Defects Found</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summary.failedRequiringFollowUp}</p>
                  <p className="text-xs text-muted-foreground">Pending Follow-ups</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by truck plate..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
              />
            </div>
            <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setPage(1) }}>
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="pre_trip">Pre-Trip</TabsTrigger>
                <TabsTrigger value="post_trip">Post-Trip</TabsTrigger>
                <TabsTrigger value="failed">Failed</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Inspections Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
            </div>
          ) : inspections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <ClipboardCheck className="h-10 w-10 mb-3 opacity-50" />
              <p className="font-medium">No inspections found</p>
              <p className="text-sm">Create a new inspection to get started</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Truck</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>Checks</TableHead>
                      <TableHead>Defects</TableHead>
                      <TableHead className="w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inspections.map((insp) => (
                      <TableRow
                        key={insp.id}
                        ref={(el) => { rowRefs.current[insp.id] = el }}
                        className={`cursor-pointer hover:bg-muted/50 ${insp.id === highlightEntityId ? highlightClassName : ''}`}
                        onClick={() => handleOpenDetail(insp.id)}
                      >
                        <TableCell className="font-medium">{insp.truck?.plateNumber}</TableCell>
                        <TableCell>
                          {insp.driver ? `${insp.driver.firstName} ${insp.driver.lastName}` : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {insp.type === 'pre_trip' ? 'Pre-Trip' : 'Post-Trip'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(insp.inspectionDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell><ResultBadge result={insp.result} /></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-emerald-600">{insp.passCount}✓</span>
                            <span className="text-amber-600">{insp.warningCount}!</span>
                            <span className="text-red-600">{insp.failCount}✗</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {insp.defectsFound ? (
                            <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs">
                              {insp.failCount} defects
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">None</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleOpenDetail(insp.id) }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-3 p-4 max-h-[500px] overflow-y-auto">
                {inspections.map((insp) => (
                  <div
                    key={insp.id}
                    ref={(el) => { rowRefs.current[insp.id] = el }}
                    className={`border rounded-lg p-4 cursor-pointer hover:bg-muted/50 ${insp.id === highlightEntityId ? highlightClassName : ''}`}
                    onClick={() => handleOpenDetail(insp.id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold">{insp.truck?.plateNumber}</span>
                      <ResultBadge result={insp.result} />
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <User className="h-3 w-3" />
                      <span>{insp.driver ? `${insp.driver.firstName} ${insp.driver.lastName}` : 'No driver'}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(insp.inspectionDate).toLocaleDateString()}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-600">{insp.passCount}✓</span>
                        <span className="text-amber-600">{insp.warningCount}!</span>
                        <span className="text-red-600">{insp.failCount}✗</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* New Inspection Dialog */}
      <InspectionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSave={() => { setFormOpen(false); loadData() }}
      />

      {/* Inspection Detail Sheet */}
      <Sheet open={!!detailInspection} onOpenChange={(open) => { if (!open) setDetailInspection(null) }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {detailLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
            </div>
          ) : detailInspection ? (
            <InspectionDetailPanel
              inspection={detailInspection}
              onClose={() => setDetailInspection(null)}
              onDelete={() => handleDelete(detailInspection.id)}
              onCompleteFollowUp={() => handleCompleteFollowUp(detailInspection.id)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ============ INSPECTION FORM DIALOG ============

interface InspectionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: () => void
}

function InspectionFormDialog({ open, onOpenChange, onSave }: InspectionFormDialogProps) {
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [truckId, setTruckId] = useState('')
  const [driverId, setDriverId] = useState('')
  const [type, setType] = useState<'pre_trip' | 'post_trip'>('pre_trip')
  const [odometerReading, setOdometerReading] = useState('')
  const [overallNotes, setOverallNotes] = useState('')
  const [inspectorName, setInspectorName] = useState('')
  const [checkItems, setCheckItems] = useState<CheckItem[]>(getDefaultCheckItems('pre_trip'))
  const [expandedCategory, setExpandedCategory] = useState<string | null>('Safety')

  useEffect(() => {
    if (open) {
      Promise.all([fetchTrucks({ limit: 200 }), fetchDrivers({ limit: 200, status: 'active' })])
        .then(([t, d]) => {
          setTrucks(t.data || [])
          setDrivers(d.data || [])
        })
        .catch(() => {})
    }
  }, [open])

  useEffect(() => {
    if (type) {
      setCheckItems(getDefaultCheckItems(type))
    }
  }, [type])

  const toggleItemStatus = (index: number) => {
    setCheckItems(prev => {
      const updated = [...prev]
      const current = updated[index].status
      if (current === 'ok') updated[index] = { ...updated[index], status: 'warning' }
      else if (current === 'warning') updated[index] = { ...updated[index], status: 'fail' }
      else updated[index] = { ...updated[index], status: 'ok' }
      return updated
    })
  }

  const updateItemNotes = (index: number, notes: string) => {
    setCheckItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], notes }
      return updated
    })
  }

  const handleSubmit = async () => {
    if (!truckId) {
      toast.error('Please select a truck')
      return
    }
    setSaving(true)
    try {
      await createInspection({
        truckId,
        driverId: driverId || undefined,
        type,
        odometerReading: odometerReading ? parseFloat(odometerReading) : undefined,
        overallNotes,
        inspectorName,
        checkItems,
      })
      toast.success('Inspection created successfully')
      onSave()
    } catch (err) {
      console.error(err)
      toast.error('Failed to create inspection')
    } finally {
      setSaving(false)
    }
  }

  const passCount = checkItems.filter(i => i.status === 'ok').length
  const warningCount = checkItems.filter(i => i.status === 'warning').length
  const failCount = checkItems.filter(i => i.status === 'fail').length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-orange-500" />
            New Vehicle Inspection
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Truck *</label>
              <Select value={truckId} onValueChange={setTruckId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select truck" />
                </SelectTrigger>
                <SelectContent>
                  {trucks.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.plateNumber} — {t.make} {t.model}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Driver</label>
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select driver" />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.firstName} {d.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Inspection Type *</label>
              <Select value={type} onValueChange={(v) => setType(v as 'pre_trip' | 'post_trip')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pre_trip">Pre-Trip</SelectItem>
                  <SelectItem value="post_trip">Post-Trip</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Odometer Reading (km)</label>
              <Input
                type="number"
                placeholder="e.g. 125000"
                value={odometerReading}
                onChange={(e) => setOdometerReading(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium">Inspector Name</label>
              <Input
                placeholder="Your name"
                value={inspectorName}
                onChange={(e) => setInspectorName(e.target.value)}
              />
            </div>
          </div>

          <Separator />

          {/* Live Summary */}
          <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-1 text-sm">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span className="font-semibold text-emerald-600">{passCount}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="font-semibold text-amber-600">{warningCount}</span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="font-semibold text-red-600">{failCount}</span>
            </div>
            <div className="ml-auto">
              {failCount === 0 && warningCount === 0 && (
                <Badge className="bg-emerald-100 text-emerald-700">All Clear</Badge>
              )}
              {failCount === 0 && warningCount > 0 && (
                <Badge className="bg-amber-100 text-amber-700">Conditional</Badge>
              )}
              {failCount > 0 && (
                <Badge className="bg-red-100 text-red-700">Requires Attention</Badge>
              )}
            </div>
          </div>

          {/* Check Items by Category */}
          <div className="space-y-3">
            {INSPECTION_CATEGORIES.filter(cat => {
              if (type === 'post_trip' && cat.name === 'Documents') {
                return cat.items.some(i => i !== 'Roadworthy certificate')
              }
              return true
            }).map((cat) => {
              const CatIcon = cat.icon
              const catItems = checkItems.filter(i => i.category === cat.name)
              const isExpanded = expandedCategory === cat.name
              const hasFail = catItems.some(i => i.status === 'fail')

              return (
                <div key={cat.name} className="border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                    onClick={() => setExpandedCategory(isExpanded ? null : cat.name)}
                  >
                    <div className="flex items-center gap-2">
                      <CatIcon className="h-4 w-4 text-orange-500" />
                      <span className="font-medium text-sm">{cat.name}</span>
                      {hasFail && (
                        <Badge className="bg-red-100 text-red-700 text-xs ml-1">!</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {catItems.filter(i => i.status === 'ok').length}/{catItems.length} pass
                      </span>
                      {isExpanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="p-3 pt-0 space-y-2">
                      {catItems.map((item) => {
                        const idx = checkItems.indexOf(item)
                        return (
                          <div key={item.name} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/30">
                            <button
                              type="button"
                              className="mt-0.5 shrink-0"
                              onClick={() => toggleItemStatus(idx)}
                            >
                              <StatusIcon status={item.status} />
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{item.name}</p>
                              <Input
                                className="mt-1 h-7 text-xs"
                                placeholder="Add notes..."
                                value={item.notes}
                                onChange={(e) => updateItemNotes(idx, e.target.value)}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Overall Notes */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Overall Notes</label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              placeholder="Any additional observations..."
              value={overallNotes}
              onChange={(e) => setOverallNotes(e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={saving || !truckId}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4 mr-2" />}
              Submit Inspection
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============ INSPECTION DETAIL PANEL ============

interface InspectionDetailPanelProps {
  inspection: VehicleInspection
  onClose: () => void
  onDelete: () => void
  onCompleteFollowUp: () => void
}

function InspectionDetailPanel({ inspection, onClose, onDelete, onCompleteFollowUp }: InspectionDetailPanelProps) {
  const [parsedItems, setParsedItems] = useState<CheckItem[]>([])
  const [parsedDefects, setParsedDefects] = useState<{ item: string; severity: string; description: string }[]>([])

  useEffect(() => {
    try {
      setParsedItems(JSON.parse(inspection.checkItems || '[]'))
    } catch { /* empty */ }
    try {
      setParsedDefects(JSON.parse(inspection.defectDetails || '[]'))
    } catch { /* empty */ }
  }, [inspection])

  const grouped = INSPECTION_CATEGORIES.map(cat => ({
    ...cat,
    items: parsedItems.filter(i => i.category === cat.name),
  })).filter(g => g.items.length > 0)

  return (
    <div className="space-y-6">
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-orange-500" />
          Inspection Detail
        </SheetTitle>
      </SheetHeader>

      {/* Header Info */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{inspection.truck?.plateNumber}</h3>
          <ResultBadge result={inspection.result} />
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            <span>{inspection.driver ? `${inspection.driver.firstName} ${inspection.driver.lastName}` : 'No driver'}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>{new Date(inspection.inspectionDate).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            <span>{inspection.type === 'pre_trip' ? 'Pre-Trip' : 'Post-Trip'}</span>
          </div>
          {inspection.inspectorName && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              <span>{inspection.inspectorName}</span>
            </div>
          )}
        </div>

        {/* Check Summary */}
        <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-1 text-sm">
            <CheckCircle className="h-4 w-4 text-emerald-500" />
            <span className="font-semibold text-emerald-600">{inspection.passCount}</span>
          </div>
          <div className="flex items-center gap-1 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="font-semibold text-amber-600">{inspection.warningCount}</span>
          </div>
          <div className="flex items-center gap-1 text-sm">
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="font-semibold text-red-600">{inspection.failCount}</span>
          </div>
          <span className="text-xs text-muted-foreground ml-auto">
            {inspection.totalChecks} total checks
          </span>
        </div>
      </div>

      <Separator />

      {/* Check Items by Category */}
      <div className="space-y-4">
        <h4 className="font-semibold text-sm">Check Items</h4>
        {grouped.map((group) => {
          const CatIcon = group.icon
          const allPass = group.items.every(i => i.status === 'ok')
          return (
            <div key={group.name} className="space-y-1">
              <div className="flex items-center gap-2">
                <CatIcon className="h-3.5 w-3.5 text-orange-500" />
                <span className="text-sm font-medium">{group.name}</span>
                {allPass && (
                  <Badge className="bg-emerald-100 text-emerald-700 text-xs">All OK</Badge>
                )}
              </div>
              <div className="ml-5 space-y-1">
                {group.items.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <StatusIcon status={item.status} />
                    <div className="flex-1">
                      <span className="text-sm">{item.name}</span>
                      {item.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Defects */}
      {parsedDefects.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-red-600">Defects Found</h4>
            {parsedDefects.map((defect, idx) => (
              <div key={idx} className="flex items-start gap-2 p-2 rounded bg-red-50 dark:bg-red-950/20">
                <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{defect.item}</p>
                  <p className="text-xs text-muted-foreground">{defect.description}</p>
                  <Badge className="mt-1 bg-red-100 text-red-700 text-xs">
                    {defect.severity}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Overall Notes */}
      {inspection.overallNotes && (
        <>
          <Separator />
          <div className="space-y-1">
            <h4 className="font-semibold text-sm">Notes</h4>
            <p className="text-sm text-muted-foreground">{inspection.overallNotes}</p>
          </div>
        </>
      )}

      {/* Follow-up */}
      {inspection.requiresFollowUp && (
        <>
          <Separator />
          <div className="space-y-3 p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h4 className="font-semibold text-sm text-amber-700 dark:text-amber-400">
                {inspection.followUpCompletedAt ? 'Follow-up Completed' : 'Follow-up Required'}
              </h4>
            </div>
            {inspection.followUpNotes && (
              <p className="text-sm text-muted-foreground">{inspection.followUpNotes}</p>
            )}
            {!inspection.followUpCompletedAt && (
              <Button
                size="sm"
                variant="outline"
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400"
                onClick={onCompleteFollowUp}
              >
                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                Mark Complete
              </Button>
            )}
          </div>
        </>
      )}

      {/* Location */}
      {inspection.location && (
        <>
          <Separator />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            <span>{inspection.location}</span>
          </div>
        </>
      )}

      {/* Actions */}
      <Separator />
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 text-red-600 hover:text-red-700" onClick={onDelete}>
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </Button>
        <Button variant="outline" className="flex-1" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  )
}
