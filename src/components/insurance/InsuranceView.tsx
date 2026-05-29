'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { ShieldCheck, Search, AlertCircle, RefreshCw, Clock, Plus, Pencil, Eye } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { CURRENCY_SYMBOL } from '@/lib/constants'
import { useApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useEntityHighlight } from '@/lib/hooks/useEntityHighlight'
import { InsuranceFormDialog } from './InsuranceFormDialog'
import { InsuranceDetailSheet } from './InsuranceDetailSheet'
import { useAuthStore } from '@/lib/store/auth'

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

const INSURANCE_STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  expired: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

interface InsurancePolicy {
  id: string
  provider: string
  policyNumber: string
  type: string
  premium: number
  startDate: string
  endDate: string
  status: string
  truck: { id: string; plateNumber: string; make: string; model: string }
}

function DaysUntilExpiry({ endDate }: { endDate: string }) {
  const now = new Date()
  const end = new Date(endDate)
  const diffMs = end.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return (
      <div className="flex items-center gap-1 text-xs">
        <Clock className="h-3 w-3 text-red-500" />
        <span className="text-red-600 font-semibold">Expired</span>
      </div>
    )
  }

  if (diffDays <= 30) {
    return (
      <div className="flex items-center gap-1 text-xs">
        <Clock className="h-3 w-3 text-amber-500" />
        <span className="text-amber-600 font-semibold">{diffDays} days</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 text-xs">
      <Clock className="h-3 w-3 text-muted-foreground" />
      <span className="text-muted-foreground">{diffDays} days</span>
    </div>
  )
}

export function InsuranceView() {
  const { user } = useAuthStore()
  const canWrite = user?.role !== 'Driver'
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [formOpen, setFormOpen] = React.useState(false)
  const [editingPolicy, setEditingPolicy] = React.useState<InsurancePolicy | null>(null)
  const [selectedInsuranceId, setSelectedInsuranceId] = React.useState<string | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)
  const { data, loading, error, refetch } = useApi<{ data: InsurancePolicy[]; total: number }>(
    () => fetch('/api/insurance?limit=100').then(r => r.json()),
    []
  )

  const { highlightEntityId, highlightClassName, scrollIntoView } = useEntityHighlight('insurance')
  const rowRefs = React.useRef<Record<string, HTMLTableRowElement | HTMLDivElement | null>>({})

  const providers = React.useMemo(() => {
    if (!data?.data) return []
    return [...new Set(data.data.map(p => p.provider))].sort()
  }, [data])
  const [providerFilter, setProviderFilter] = React.useState('all')

  const filteredPolicies = React.useMemo(() => {
    if (!data?.data) return []
    return data.data.filter((policy) => {
      const matchesStatus = statusFilter === 'all' || policy.status === statusFilter
      const matchesProvider = providerFilter === 'all' || policy.provider === providerFilter
      return matchesStatus && matchesProvider
    })
  }, [data, statusFilter, providerFilter])

  // Scroll to highlighted row after data loads
  React.useEffect(() => {
    if (highlightEntityId && rowRefs.current[highlightEntityId]) {
      scrollIntoView(rowRefs.current[highlightEntityId])
    }
  }, [highlightEntityId, filteredPolicies, scrollIntoView])

  function handleView(policy: InsurancePolicy) {
    setSelectedInsuranceId(policy.id)
    setDetailOpen(true)
  }

  function handleEdit(policy: InsurancePolicy) {
    setEditingPolicy(policy)
    setFormOpen(true)
  }

  function handleDetailEdit(policy: Record<string, unknown>) {
    setDetailOpen(false)
    setEditingPolicy(policy as InsurancePolicy)
    setFormOpen(true)
  }

  function handleDetailDeleted() {
    refetch()
  }

  return (
    <motion.div
      variants={containerVariants}
      animate="show"
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Insurance Management</h1>
          <p className="text-muted-foreground">Manage fleet insurance policies and track renewals</p>
        </div>
        {canWrite && (
          <Button onClick={() => { setEditingPolicy(null); setFormOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" />
            Add Policy
          </Button>
        )}
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Providers</SelectItem>
            {providers.map((provider) => (
              <SelectItem key={provider} value={provider}>{provider}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </motion.div>

      {/* Table */}
      <motion.div variants={itemVariants}>
        <div className="rounded-lg border bg-card">
          {error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={refetch}>
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : filteredPolicies.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="No insurance policies found"
              description={statusFilter !== 'all' || providerFilter !== 'all'
                ? 'Try adjusting your filter criteria'
                : 'Add insurance policies to track fleet coverage and renewals.'}
              action={statusFilter === 'all' && providerFilter === 'all' && canWrite ? {
                label: 'Add Policy',
                onClick: () => { setEditingPolicy(null); setFormOpen(true) },
              } : undefined}
            />
          ) : (
            <>
              <div className="overflow-x-auto hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Policy #</TableHead>
                      <TableHead>Truck</TableHead>
                      <TableHead className="hidden md:table-cell">Provider</TableHead>
                      <TableHead className="hidden sm:table-cell">Type</TableHead>
                      <TableHead className="text-right">Premium</TableHead>
                      <TableHead className="hidden lg:table-cell">Start Date</TableHead>
                      <TableHead className="hidden lg:table-cell">End Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Expiry</TableHead>
                      <TableHead className="w-[110px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPolicies.map((policy) => (
                      <TableRow key={policy.id} ref={(el) => { rowRefs.current[policy.id] = el }} className={policy.id === highlightEntityId ? 'entity-highlight-row' : ''}>
                        <TableCell className="font-mono text-xs font-medium">{policy.policyNumber}</TableCell>
                        <TableCell className="text-sm">{policy.truck.plateNumber}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{policy.provider}</TableCell>
                        <TableCell className="hidden sm:table-cell text-sm capitalize">{policy.type.replace(/-/g, ' ')}</TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {CURRENCY_SYMBOL}{policy.premium.toLocaleString()}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                          {new Date(policy.startDate).toLocaleDateString('en-GB', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                          {new Date(policy.endDate).toLocaleDateString('en-GB', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn('border-transparent font-medium capitalize', INSURANCE_STATUS_COLORS[policy.status] || '')}
                          >
                            {policy.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {policy.status === 'active' && <DaysUntilExpiry endDate={policy.endDate} />}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleView(policy)}
                              title="View details"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {canWrite && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleEdit(policy)}
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="md:hidden divide-y">
                {filteredPolicies.map((policy) => (
                  <div
                    key={policy.id}
                    ref={(el) => { rowRefs.current[policy.id] = el }}
                    className={cn('mobile-card p-4', policy.id === highlightEntityId && 'entity-highlight-row')}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0 space-y-1">
                        <p className="font-mono text-xs font-medium">{policy.policyNumber}</p>
                        <p className="text-sm font-medium">{policy.truck.plateNumber}</p>
                        <p className="text-xs text-muted-foreground">{policy.provider}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold">{CURRENCY_SYMBOL}{policy.premium.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground capitalize mt-1">{policy.type.replace(/-/g, ' ')}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <Badge
                        variant="outline"
                        className={cn('border-transparent font-medium capitalize', INSURANCE_STATUS_COLORS[policy.status] || '')}
                      >
                        {policy.status}
                      </Badge>
                      <div className="flex items-center gap-2">
                        {policy.status === 'active' && <DaysUntilExpiry endDate={policy.endDate} />}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => handleView(policy)}
                        >
                          <Eye className="mr-1 h-3 w-3" /> View
                        </Button>
                        {canWrite && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(policy)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* Form Dialog */}
      <InsuranceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        insurance={editingPolicy}
        onSuccess={() => { refetch(); setEditingPolicy(null) }}
      />

      {/* Detail Sheet */}
      <InsuranceDetailSheet
        insuranceId={selectedInsuranceId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={handleDetailEdit}
        onDeleted={handleDetailDeleted}
      />
    </motion.div>
  )
}
