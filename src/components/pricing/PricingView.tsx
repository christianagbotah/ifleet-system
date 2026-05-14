'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Plus, Search, DollarSign, AlertCircle, RefreshCw, Pencil, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
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
import { fetchPricing, type PricingEntry } from '@/lib/api'
import { PricingFormDialog } from '@/components/pricing/PricingFormDialog'
import { toast } from 'sonner'

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

export function PricingView() {
  const [search, setSearch] = React.useState('')
  const [entries, setEntries] = React.useState<PricingEntry[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [editingPricing, setEditingPricing] = React.useState<PricingEntry | undefined>(undefined)

  const loadPricing = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Parameters<typeof fetchPricing>[0] = { limit: 100 }
      if (search) params.itemName = search
      const result = await fetchPricing(params)
      setEntries(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch pricing')
    } finally {
      setLoading(false)
    }
  }, [search])

  React.useEffect(() => {
    loadPricing()
  }, [loadPricing])

  const avgRate = entries.length > 0
    ? entries.reduce((sum, p) => sum + p.transportRate, 0) / entries.length
    : 0

  return (
    <motion.div
      variants={containerVariants}
      animate="show"
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pricing & Transport Rates</h1>
          <p className="text-muted-foreground">Manage freight transport rates</p>
        </div>
        <Button
          onClick={() => { setEditingPricing(undefined); setFormOpen(true) }}
          className="bg-amber-500 hover:bg-amber-600 text-white"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Pricing
        </Button>
      </motion.div>

      {/* Summary Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-3 w-24 mb-3" /><Skeleton className="h-8 w-16" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Truck className="h-4 w-4 text-amber-500" />
                  <span className="text-xs sm:text-sm text-muted-foreground">Total Entries</span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold">{entries.length}</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs sm:text-sm text-muted-foreground">Avg Transport Rate</span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-emerald-600">
                  {CURRENCY_SYMBOL}{avgRate.toLocaleString('en-GH', { maximumFractionDigits: 0 })}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </motion.div>

      {/* Search */}
      <motion.div variants={itemVariants}>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by item or destination..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </motion.div>

      {/* Table */}
      <motion.div variants={itemVariants}>
        <div className="rounded-lg border bg-card">
          {error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={loadPricing}>
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <EmptyState
              icon={DollarSign}
              title="No pricing entries found"
              description="Try adjusting your search or add a new pricing entry"
            />
          ) : (
            <>
            {/* Desktop Table */}
            <div className="overflow-x-auto hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead className="text-right">Transport Rate</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((pricing) => (
                    <TableRow key={pricing.id}>
                      <TableCell className="font-medium text-sm">{pricing.itemName}</TableCell>
                      <TableCell className="text-sm">{pricing.destination}</TableCell>
                      <TableCell className="text-right text-sm font-semibold">
                        {CURRENCY_SYMBOL}{pricing.transportRate.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => { setEditingPricing(pricing); setFormOpen(true) }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y">
              {entries.map((pricing) => (
                <div key={pricing.id} className="mobile-card p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{pricing.itemName}</p>
                      <p className="text-xs text-muted-foreground">{pricing.destination}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => { setEditingPricing(pricing); setFormOpen(true) }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground">Transport Rate </span>
                      <span className="font-semibold">{CURRENCY_SYMBOL}{pricing.transportRate.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
        </div>
      </motion.div>

      <PricingFormDialog
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditingPricing(undefined) }}
        pricing={editingPricing}
        onCreated={loadPricing}
        onUpdated={loadPricing}
      />
    </motion.div>
  )
}
