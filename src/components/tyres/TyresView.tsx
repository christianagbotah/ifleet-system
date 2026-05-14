'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  CircleDot, Search, AlertCircle, RefreshCw, Plus, Pencil, Eye,
  ChevronLeft, ChevronRight, Package, DollarSign,
  AlertTriangle, CircleCheckBig, Layers, Truck, LayoutGrid, List,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SearchableSelect, type SearchableOption } from '@/components/ui/searchable-select'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { fetchTrucks, apiFetch, useApi } from '@/lib/api'
import { useDebounce } from '@/hooks/use-debounce'
import { useAuthStore } from '@/lib/store/auth'
import { useCurrency } from '@/lib/currency-context'
import { TYRE_CONDITIONS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useEntityHighlight } from '@/lib/hooks/useEntityHighlight'
import { TyreFormDialog } from './TyreFormDialog'
import { BulkTyreFormDialog } from './BulkTyreFormDialog'
import { TyreDetailSheet } from './TyreDetailSheet'

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

type ViewMode = 'grid' | 'table'

interface Tyre {
  id: string
  serialNumber: string
  brand: string
  purchaseDate: string
  purchasePrice: number
  condition: string
  notes?: string | null
  retiredDate?: string | null
  retiredReason?: string | null
  lastInspection?: string | null
  truck: { id: string; plateNumber: string; make: string; model: string }
}

interface TyreSummary {
  total: number
  byCondition: Record<string, number>
  totalValue: number
}

const GRID_ITEMS_PER_PAGE = 12
const TABLE_ITEMS_PER_PAGE = 15

// Stat card component
function StatCard({ icon: Icon, label, value, subtext, color }: {
  icon: React.ElementType
  label: string
  value: string | number
  subtext?: string
  color: string
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
            <p className={cn("text-2xl font-bold", color)}>{value}</p>
            {subtext && (
              <p className="text-xs text-muted-foreground">{subtext}</p>
            )}
          </div>
          <div className={cn("rounded-lg p-2", color === 'text-amber-600' ? 'bg-amber-100 dark:bg-amber-900/30' : color === 'text-emerald-600' ? 'bg-emerald-100 dark:bg-emerald-900/30' : color === 'text-red-600' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-gray-100 dark:bg-gray-800')}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// View Toggle
function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="inline-flex items-center rounded-lg border bg-muted/50 p-0.5">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-7 w-7 p-0 rounded-md',
                mode === 'grid' && 'bg-background shadow-sm'
              )}
              onClick={() => onChange('grid')}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Grid view</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-7 w-7 p-0 rounded-md',
                mode === 'table' && 'bg-background shadow-sm'
              )}
              onClick={() => onChange('table')}
            >
              <List className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Table view</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}

// Tyre Grid Card
function TyreGridCard({ tyre, currencySymbol, canWrite, isHighlighted, highlightClassName, onView, onEdit, refProp }: {
  tyre: Tyre
  currencySymbol: string
  canWrite: boolean
  isHighlighted: boolean
  highlightClassName: string
  onView: (tyre: Tyre) => void
  onEdit: (tyre: Tyre) => void
  refProp: (el: HTMLDivElement | null) => void
}) {
  const isRetired = !!tyre.retiredDate
  const conditionMeta = TYRE_CONDITIONS[tyre.condition as keyof typeof TYRE_CONDITIONS]

  return (
    <Card
      ref={refProp}
      className={cn(
        'group relative cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/20 active:scale-[0.99]',
        isHighlighted && highlightClassName,
        isRetired && 'opacity-60'
      )}
      onClick={() => onView(tyre)}
    >
      <CardContent className="p-4 space-y-3">
        {/* Top row: serial + condition badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold truncate">{tyre.serialNumber}</p>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Truck className="h-3 w-3 shrink-0" />
              <span className="truncate">{tyre.truck.plateNumber}</span>
              <span className="shrink-0">· {tyre.truck.make} {tyre.truck.model}</span>
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn('border-transparent font-medium shrink-0 text-xs', conditionMeta?.color || '')}
          >
            {conditionMeta?.label || tyre.condition}
          </Badge>
        </div>

        {/* Middle: brand + price */}
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Brand</p>
            <p className="text-sm font-medium truncate">{tyre.brand}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Price</p>
            <p className="text-sm font-bold">
              {currencySymbol}{tyre.purchasePrice.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Bottom: date + notes */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {new Date(tyre.purchaseDate).toLocaleDateString('en-GB', {
              day: '2-digit', month: 'short', year: 'numeric',
            })}
          </span>
          {tyre.lastInspection && (
            <>
              <span className="text-border">·</span>
              <span>Inspected {new Date(tyre.lastInspection).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
              })}</span>
            </>
          )}
        </div>

        {tyre.notes && (
          <p className="text-xs text-muted-foreground truncate">{tyre.notes}</p>
        )}

        {/* Retired badge */}
        {isRetired && (
          <Badge variant="outline" className="border-orange-300 text-orange-600 dark:text-orange-400 text-[10px]">
            Retired
          </Badge>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-0.5 pt-1 border-t">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); onView(tyre) }}>
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View details</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {canWrite && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); onEdit(tyre) }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit tyre</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function TyresView() {
  const [search, setSearch] = React.useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [conditionFilter, setConditionFilter] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [viewMode, setViewMode] = React.useState<ViewMode>('grid')
  const { data, loading, error, refetch } = useApi<{ data: Tyre[]; total: number; summary: TyreSummary }>(
    () => apiFetch<{ data: Tyre[]; total: number; summary: TyreSummary }>('/api/tyres?limit=500'),
    []
  )
  const [truckFilter, setTruckFilter] = React.useState('all')
  const { highlightEntityId, highlightClassName, scrollIntoView } = useEntityHighlight('tyre')
  const cardRefs = React.useRef<Record<string, HTMLDivElement | null>>({})
  const rowRefs = React.useRef<Record<string, HTMLTableRowElement | null>>({})

  const { user } = useAuthStore()
  const { currencySymbol } = useCurrency()
  const canWrite = user?.role !== 'Driver'
  const driverId = user?.role === 'Driver' && user.driverId ? user.driverId : undefined
  const [formOpen, setFormOpen] = React.useState(false)
  const [bulkFormOpen, setBulkFormOpen] = React.useState(false)
  const [editingTyre, setEditingTyre] = React.useState<Tyre | null>(null)
  const [viewingTyre, setViewingTyre] = React.useState<Tyre | null>(null)
  const { data: trucksData } = useApi<{ data: { id: string; plateNumber: string }[] }>(
    () => fetchTrucks({ limit: 500, driverId }),
    [driverId]
  )

  const filteredTyres = React.useMemo(() => {
    if (!data?.data) return []
    return data.data.filter((tyre) => {
      const matchesSearch = !debouncedSearch ||
        tyre.serialNumber.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        tyre.brand.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (tyre.notes && tyre.notes.toLowerCase().includes(debouncedSearch.toLowerCase()))
      const matchesCondition = conditionFilter === 'all' || tyre.condition === conditionFilter
      const matchesTruck = truckFilter === 'all' || tyre.truck.id === truckFilter
      return matchesSearch && matchesCondition && matchesTruck
    })
  }, [data, debouncedSearch, conditionFilter, truckFilter])

  const itemsPerPage = viewMode === 'grid' ? GRID_ITEMS_PER_PAGE : TABLE_ITEMS_PER_PAGE
  const totalPages = Math.ceil(filteredTyres.length / itemsPerPage)
  const paginatedTyres = React.useMemo(() => {
    return filteredTyres.slice((page - 1) * itemsPerPage, page * itemsPerPage)
  }, [filteredTyres, page, itemsPerPage])

  // Reset to page 1 when filters or view mode change
  React.useEffect(() => {
    setPage(1)
  }, [debouncedSearch, conditionFilter, truckFilter, viewMode])

  // Scroll to highlighted item after data loads
  React.useEffect(() => {
    if (highlightEntityId && !loading) {
      const el = viewMode === 'grid'
        ? cardRefs.current[highlightEntityId]
        : rowRefs.current[highlightEntityId]
      if (el) scrollIntoView(el)
    }
  }, [highlightEntityId, loading, filteredTyres, scrollIntoView, viewMode])

  const summary = data?.summary

  return (
    <motion.div
      variants={containerVariants}
      animate="show"
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tyre Management</h1>
          <p className="text-muted-foreground">Track tyre inventory, conditions, and replacement schedules</p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Button onClick={() => { setEditingTyre(null); setBulkFormOpen(true) }} variant="outline">
              <Layers className="mr-2 h-4 w-4" />
              Bulk Add
            </Button>
            <Button onClick={() => { setEditingTyre(null); setFormOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" />
              Add Tyre
            </Button>
          </div>
        )}
      </motion.div>

      {/* Summary Stats Cards */}
      {!loading && summary && (
        <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={Package}
            label="Total Tyres"
            value={summary.total}
            subtext="Across all trucks"
            color="text-foreground"
          />
          <StatCard
            icon={DollarSign}
            label="Total Value"
            value={`${currencySymbol}${summary.totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
            subtext="Investment value"
            color="text-amber-600"
          />
          <StatCard
            icon={CircleCheckBig}
            label="Good Condition"
            value={(summary.byCondition?.['good'] || 0) + (summary.byCondition?.['new'] || 0)}
            subtext={`${summary.byCondition?.['new'] || 0} new, ${summary.byCondition?.['good'] || 0} good`}
            color="text-emerald-600"
          />
          <StatCard
            icon={AlertTriangle}
            label="Needs Attention"
            value={(summary.byCondition?.['worn'] || 0) + (summary.byCondition?.['damaged'] || 0)}
            subtext={`${summary.byCondition?.['worn'] || 0} worn, ${summary.byCondition?.['damaged'] || 0} damaged`}
            color="text-red-600"
          />
        </motion.div>
      )}

      {/* Loading skeleton for stats */}
      {loading && (
        <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </motion.div>
      )}

      {/* Filters */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by serial #, brand, or notes..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={conditionFilter} onValueChange={setConditionFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Condition" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Conditions</SelectItem>
            {Object.keys(TYRE_CONDITIONS).map((key) => (
              <SelectItem key={key} value={key}>{TYRE_CONDITIONS[key as keyof typeof TYRE_CONDITIONS].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SearchableSelect
          className="w-full sm:w-44"
          placeholder="All Trucks"
          searchPlaceholder="Search trucks..."
          emptyMessage="No truck found."
          value={truckFilter}
          onValueChange={setTruckFilter}
          options={[
            { value: 'all', label: 'All Trucks' },
            ...(trucksData?.data || []).map((t): SearchableOption => ({ value: t.id, label: t.plateNumber })),
          ]}
        />
      </motion.div>

      {/* Results count + view toggle */}
      {!loading && (
        <motion.div variants={itemVariants} className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {filteredTyres.length} tyre{filteredTyres.length !== 1 ? 's' : ''} found
            {totalPages > 1 && ` — showing ${(page - 1) * itemsPerPage + 1}–${Math.min(page * itemsPerPage, filteredTyres.length)}`}
          </span>
          <ViewToggle mode={viewMode} onChange={(m) => setViewMode(m)} />
        </motion.div>
      )}

      {/* Tyre List: Grid or Table */}
      <motion.div variants={itemVariants}>
        {error ? (
          <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border bg-card">
            <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
            <p className="text-sm text-muted-foreground mb-3">{error}</p>
            <Button variant="outline" size="sm" onClick={refetch}>
              <RefreshCw className="mr-2 h-3 w-3" /> Retry
            </Button>
          </div>
        ) : loading ? (
          viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <Skeleton key={i} className="h-52 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border bg-card">
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-12 w-full rounded" />
                ))}
              </div>
            </div>
          )
        ) : filteredTyres.length === 0 ? (
          <EmptyState
            icon={CircleDot}
            title="No tyres found"
            description={search || conditionFilter !== 'all' || truckFilter !== 'all'
              ? 'Try adjusting your search or filter criteria'
              : 'Add tyres to start tracking your fleet\'s tyre inventory.'}
            action={!search && conditionFilter === 'all' && truckFilter === 'all' && canWrite ? {
              label: 'Add Tyre',
              onClick: () => { setEditingTyre(null); setFormOpen(true) },
            } : undefined}
          />
        ) : viewMode === 'grid' ? (
          /* ========== GRID VIEW ========== */
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {paginatedTyres.map((tyre) => (
                <TyreGridCard
                  key={tyre.id}
                  tyre={tyre}
                  currencySymbol={currencySymbol}
                  canWrite={canWrite}
                  isHighlighted={tyre.id === highlightEntityId}
                  highlightClassName={highlightClassName}
                  onView={(t) => setViewingTyre(t)}
                  onEdit={(t) => { setEditingTyre(t); setFormOpen(true) }}
                  refProp={(el) => { cardRefs.current[tyre.id] = el }}
                />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
                <PaginationButtons page={page} totalPages={totalPages} setPage={setPage} />
              </div>
            )}
          </>
        ) : (
          /* ========== TABLE VIEW ========== */
          <div className="rounded-lg border bg-card">
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serial #</TableHead>
                    <TableHead>Truck</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead className="hidden lg:table-cell">Purchase Date</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead className="hidden xl:table-cell">Last Inspection</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTyres.map((tyre) => {
                    const isRetired = !!tyre.retiredDate
                    return (
                      <TableRow
                        key={tyre.id}
                        ref={(el) => { rowRefs.current[tyre.id] = el }}
                        className={cn(
                          'group cursor-pointer',
                          tyre.id === highlightEntityId && highlightClassName,
                          isRetired && 'opacity-60'
                        )}
                        onClick={() => setViewingTyre(tyre)}
                      >
                        <TableCell className="font-mono text-xs font-medium">{tyre.serialNumber}</TableCell>
                        <TableCell>
                          <div>
                            <span className="text-sm font-medium">{tyre.truck.plateNumber}</span>
                            <span className="text-xs text-muted-foreground ml-1.5">{tyre.truck.make} {tyre.truck.model}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{tyre.brand}</TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                          {new Date(tyre.purchaseDate).toLocaleDateString('en-GB', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {currencySymbol}{tyre.purchasePrice.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn('border-transparent font-medium', TYRE_CONDITIONS[tyre.condition as keyof typeof TYRE_CONDITIONS]?.color || '')}
                          >
                            {TYRE_CONDITIONS[tyre.condition as keyof typeof TYRE_CONDITIONS]?.label || tyre.condition}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                          {tyre.lastInspection
                            ? new Date(tyre.lastInspection).toLocaleDateString('en-GB', {
                                day: '2-digit', month: 'short', year: 'numeric',
                              })
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-0.5">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setViewingTyre(tyre) }}>
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>View details</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            {canWrite && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditingTyre(tyre); setFormOpen(true) }}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit tyre</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile table fallback — card list */}
            <div className="md:hidden divide-y">
              {paginatedTyres.map((tyre) => {
                const isRetired = !!tyre.retiredDate
                return (
                  <div
                    key={tyre.id}
                    ref={(el) => { cardRefs.current[tyre.id] = el }}
                    className={cn(
                      'mobile-card p-4 space-y-3 cursor-pointer active:bg-muted/60',
                      tyre.id === highlightEntityId && highlightClassName,
                      isRetired && 'opacity-60'
                    )}
                    onClick={() => setViewingTyre(tyre)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-semibold">{tyre.serialNumber}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{tyre.truck.plateNumber} — {tyre.truck.make} {tyre.truck.model}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn('border-transparent font-medium shrink-0', TYRE_CONDITIONS[tyre.condition as keyof typeof TYRE_CONDITIONS]?.color || '')}
                      >
                        {TYRE_CONDITIONS[tyre.condition as keyof typeof TYRE_CONDITIONS]?.label || tyre.condition}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{tyre.brand}</span>
                      <span className="ml-auto font-medium text-foreground">
                        {currencySymbol}{tyre.purchasePrice.toLocaleString()}
                      </span>
                    </div>
                    {tyre.notes && (
                      <p className="text-xs text-muted-foreground truncate">{tyre.notes}</p>
                    )}
                    <div className="flex items-center justify-end gap-0.5">
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setViewingTyre(tyre) }}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {canWrite && (
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditingTyre(tyre); setFormOpen(true) }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Table Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
                <PaginationButtons page={page} totalPages={totalPages} setPage={setPage} />
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* Form Dialog */}
      <TyreFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        tyre={editingTyre}
        onSuccess={() => { refetch(); setEditingTyre(null) }}
      />

      {/* Bulk Add Dialog */}
      <BulkTyreFormDialog
        open={bulkFormOpen}
        onOpenChange={setBulkFormOpen}
        onCreated={() => refetch()}
      />

      {/* Tyre Detail Side Sheet */}
      <TyreDetailSheet
        tyre={viewingTyre}
        open={!!viewingTyre}
        onOpenChange={(open) => { if (!open) setViewingTyre(null) }}
        onEdit={(tyre) => { setViewingTyre(null); setEditingTyre(tyre); setFormOpen(true) }}
        onDeleted={() => refetch()}
      />
    </motion.div>
  )
}

/** Reusable pagination button group */
function PaginationButtons({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (p: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setPage(p => Math.max(1, p - 1))}
        disabled={page === 1}
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="sr-only">Previous page</span>
      </Button>
      <div className="flex items-center gap-1">
        {generatePageNumbers(page, totalPages).map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="px-2 text-xs text-muted-foreground">...</span>
          ) : (
            <Button
              key={p}
              variant={page === p ? 'default' : 'outline'}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setPage(p as number)}
            >
              {p}
            </Button>
          )
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
        disabled={page === totalPages}
      >
        <ChevronRight className="h-4 w-4" />
        <span className="sr-only">Next page</span>
      </Button>
    </div>
  )
}

/** Generate an array of page numbers with ellipsis for large ranges */
function generatePageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1)

  const pages: (number | string)[] = [1]

  if (current > 3) pages.push('...')

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)

  for (let i = start; i <= end; i++) pages.push(i)

  if (current < total - 2) pages.push('...')

  pages.push(total)

  return pages
}
