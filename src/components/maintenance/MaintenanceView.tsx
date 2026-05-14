'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Plus, Search, Wrench, AlertCircle, RefreshCw, Eye, Pencil, Upload, Brain } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import { useDebounce } from '@/hooks/use-debounce'
import { fetchMaintenance, type MaintenanceRecord } from '@/lib/api'
import { MaintenanceFormDialog } from '@/components/maintenance/MaintenanceFormDialog'
import { PredictiveMaintenancePanel } from '@/components/maintenance/PredictiveMaintenancePanel'
import { MaintenanceDetailSheet } from '@/components/maintenance/MaintenanceDetailSheet'
import { ImportCSVDialog } from '@/components/import-csv-dialog'
import { toast } from 'sonner'
import { useEntityHighlight } from '@/lib/hooks/useEntityHighlight'

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

export function MaintenanceView() {
  const [search, setSearch] = React.useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [activeTab, setActiveTab] = React.useState('all')
  const [records, setRecords] = React.useState<MaintenanceRecord[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [editingRecord, setEditingRecord] = React.useState<MaintenanceRecord | undefined>(undefined)
  const [importOpen, setImportOpen] = React.useState(false)
  const [viewRecord, setViewRecord] = React.useState<MaintenanceRecord | null>(null)

  const loadRecords = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Parameters<typeof fetchMaintenance>[0] = { limit: 100 }
      if (activeTab === 'due') {
        params.status = 'pending'
      } else if (activeTab === 'completed') {
        params.status = 'completed'
      }
      const result = await fetchMaintenance(params)
      setRecords(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch maintenance records')
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  React.useEffect(() => {
    loadRecords()
  }, [loadRecords])

  // Summary stats based on all records
  const allFiltered = React.useMemo(() => {
    if (!debouncedSearch) return records
    return records.filter((m) =>
      m.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      m.truck.plateNumber.toLowerCase().includes(debouncedSearch.toLowerCase())
    )
  }, [records, debouncedSearch])

  // Fetch counts for summary - use actual records
  const pendingCount = allFiltered.filter(m => m.status === 'pending').length
  const inProgressCount = allFiltered.filter(m => m.status === 'in_progress').length
  const completedCount = allFiltered.filter(m => m.status === 'completed').length
  const totalCost = allFiltered.reduce((s, m) => s + (m.cost || 0), 0)

  return (
    <motion.div
      variants={containerVariants}
      animate="show"
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Service Records</h1>
          <p className="text-muted-foreground">Track maintenance and service history</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            className="hidden sm:flex gap-2"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>
          <Button
            onClick={() => { setEditingRecord(undefined); setFormOpen(true) }}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Record
          </Button>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-3 w-16 mb-2" /><Skeleton className="h-6 w-10" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-xl font-bold text-amber-600">{pendingCount}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">In Progress</p>
                <p className="text-xl font-bold text-sky-600">{inProgressCount}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="text-xl font-bold text-emerald-600">{completedCount}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Cost</p>
                <p className="text-xl font-bold">{CURRENCY_SYMBOL}{totalCost.toLocaleString()}</p>
              </CardContent>
            </Card>
          </>
        )}
      </motion.div>

      {/* Search & Tabs */}
      <motion.div variants={itemVariants} className="space-y-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title or truck plate..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="all">All Records</TabsTrigger>
            <TabsTrigger value="due">Due Soon</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="predicted" className="gap-1.5">
              <Brain className="h-3.5 w-3.5" />
              Predicted
            </TabsTrigger>
          </TabsList>

          <TabsContent value="predicted" className="mt-4">
            <PredictiveMaintenancePanel />
          </TabsContent>

          {error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center mt-4">
              <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={loadRecords}>
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="mt-4 p-4 space-y-3">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : (
            <MaintenanceTable
              records={allFiltered}
              onView={(r) => setViewRecord(r)}
              onEdit={(r) => { setEditingRecord(r); setFormOpen(true) }}
            />
          )}
        </Tabs>
      </motion.div>

      <MaintenanceFormDialog
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditingRecord(undefined) }}
        record={editingRecord}
        onCreated={loadRecords}
        onUpdated={loadRecords}
      />

      <MaintenanceDetailSheet
        record={viewRecord}
        open={!!viewRecord}
        onOpenChange={(open) => { if (!open) setViewRecord(null) }}
      />

      <ImportCSVDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        type="maintenance"
        label="Maintenance"
        onSuccess={loadRecords}
      />
    </motion.div>
  )
}

function MaintenanceTable({ records, onView, onEdit }: {
  records: MaintenanceRecord[]
  onView: (record: MaintenanceRecord) => void
  onEdit: (record: MaintenanceRecord) => void
}) {
  const { highlightEntityId, highlightClassName, scrollIntoView } = useEntityHighlight('maintenancerecord')
  const rowRefs = React.useRef<Record<string, HTMLTableRowElement | HTMLDivElement | null>>({})

  // Scroll to highlighted row after data loads
  React.useEffect(() => {
    if (highlightEntityId && rowRefs.current[highlightEntityId]) {
      scrollIntoView(rowRefs.current[highlightEntityId])
    }
  }, [highlightEntityId, records, scrollIntoView])

  if (records.length === 0) {
    return (
      <div className="rounded-lg border bg-card mt-4">
        <EmptyState
          icon={Wrench}
          title="No maintenance records found"
          description="Try adjusting your search or add a new record"
        />
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card mt-4">
      <div className="hidden md:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="hidden sm:table-cell">Truck</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="text-right hidden sm:table-cell">Cost</TableHead>
              <TableHead className="hidden md:table-cell">Next Due</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={record.id} ref={(el) => { rowRefs.current[record.id] = el }} className={record.id === highlightEntityId ? highlightClassName : ''}>
                <TableCell className="text-sm">{new Date(record.performedAt).toLocaleDateString()}</TableCell>
                <TableCell className="hidden sm:table-cell text-sm font-medium">{record.truck.plateNumber}</TableCell>
                <TableCell>
                  <StatusBadge status={record.type} variant="maintenance" />
                </TableCell>
                <TableCell className="text-sm font-medium">{record.title}</TableCell>
                <TableCell className="text-right text-sm font-semibold hidden sm:table-cell">
                  {record.cost ? `${CURRENCY_SYMBOL}${record.cost.toLocaleString()}` : '-'}
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                  {record.nextDueDate ? new Date(record.nextDueDate).toLocaleDateString() : '-'}
                </TableCell>
                <TableCell>
                  <StatusBadge status={record.status} variant="payroll" />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => { e.stopPropagation(); onView(record) }}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => { e.stopPropagation(); onEdit(record) }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
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
        {records.map((record) => (
          <div
            key={record.id}
            ref={(el) => { rowRefs.current[record.id] = el }}
            className={`mobile-card p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors${record.id === highlightEntityId ? ' ' + highlightClassName : ''}`}
            onClick={() => onView(record)}
          >
            {/* Row 1: Date, truck plate (bold), type badge, title (bold) */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate">{record.truck.plateNumber}</p>
                <p className="text-sm font-medium truncate">{record.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(record.performedAt).toLocaleDateString()}
                </p>
              </div>
              <StatusBadge status={record.type} variant="maintenance" />
            </div>

            {/* Row 2: Cost (right-aligned), next due date, status badge */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-muted-foreground text-xs">Next Due</p>
                  <p className="text-sm">
                    {record.nextDueDate ? new Date(record.nextDueDate).toLocaleDateString() : '—'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={record.status} variant="payroll" />
                <div className="text-right">
                  <p className="text-muted-foreground text-xs">Cost</p>
                  <p className="text-sm font-semibold">
                    {record.cost ? `${CURRENCY_SYMBOL}${record.cost.toLocaleString()}` : '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Row 3: View and Edit action buttons with min-h-[44px] touch targets */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="h-[44px] min-h-[44px] text-xs"
                onClick={(e) => {
                  e.stopPropagation()
                  onView(record)
                }}
              >
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                View
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-[44px] min-h-[44px] text-xs"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(record)
                }}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
