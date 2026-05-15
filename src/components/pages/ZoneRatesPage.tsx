'use client'

import { useState } from 'react'
import { useDebounce } from '@/hooks/use-debounce'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  MapPin,
  AlertCircle,
  Loader2,
  ChevronRight,
  Calculator,
  Navigation,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useAppStore } from '@/lib/store'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { PageSkeleton } from '@/components/ui/page-skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/lib/toast-config'

interface ZoneRateData {
  id: string
  zoneName: string
  fromRegion: string
  toRegion: string
  ratePerKm: number
  minimumRate: number
  waitingRate: number
  isActive: boolean
  effectiveDate: string
}

const zoneRateSchema = z.object({
  zoneName: z.string().min(2, 'Zone name is required'),
  fromRegion: z.string().min(2, 'From region is required'),
  toRegion: z.string().min(2, 'To region is required'),
  ratePerKm: z.coerce.number().min(0, 'Rate must be 0 or greater'),
  minimumRate: z.coerce.number().min(0, 'Minimum rate must be 0 or greater'),
  waitingRate: z.coerce.number().min(0).default(0),
  isActive: z.boolean().default(true),
  effectiveDate: z.string().min(1, 'Effective date is required'),
})

type ZoneRateFormValues = z.infer<typeof zoneRateSchema>

export default function ZoneRatesPage() {
  const queryClient = useQueryClient()
  const { setCurrentView } = useAppStore()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [formOpen, setFormOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedRate, setSelectedRate] = useState<ZoneRateData | null>(null)

  // Listen for command palette "Add Zone Rate" action
  useEffect(() => {
    const handler = () => setFormOpen(true)
    window.addEventListener('ifleetpro:open-form:zone-rates', handler)
    return () => window.removeEventListener('ifleetpro:open-form:zone-rates', handler)
  }, [])

  const { data: rates = [], isLoading, error, refetch } = useQuery<ZoneRateData[]>({
    queryKey: ['zone-rates'],
    queryFn: async () => {
      const res = await fetch('/api/zone-rates')
      if (!res.ok) throw new Error('Failed to fetch zone rates')
      return res.json()
    },
  })

  const form = useForm<ZoneRateFormValues>({
    resolver: zodResolver(zoneRateSchema),
    defaultValues: {
      zoneName: '', fromRegion: '', toRegion: '', ratePerKm: 0,
      minimumRate: 0, waitingRate: 0, isActive: true, effectiveDate: '',
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: ZoneRateFormValues) => {
      const res = await fetch('/api/zone-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create zone rate')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zone-rates'] })
      toast.success('Zone rate created successfully')
      setFormOpen(false)
      form.reset()
    },
    onError: (err) => toast.error(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const res = await fetch(`/api/zone-rates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update zone rate')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zone-rates'] })
      toast.success('Zone rate updated successfully')
      setFormOpen(false)
      setSelectedRate(null)
      form.reset()
    },
    onError: (err) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/zone-rates/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete zone rate')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zone-rates'] })
      toast.success('Zone rate deleted successfully')
      setDeleteOpen(false)
      setSelectedRate(null)
    },
    onError: (err) => toast.error(err.message),
  })

  const handleEdit = (rate: ZoneRateData) => {
    setSelectedRate(rate)
    form.reset({
      zoneName: rate.zoneName,
      fromRegion: rate.fromRegion,
      toRegion: rate.toRegion,
      ratePerKm: rate.ratePerKm,
      minimumRate: rate.minimumRate,
      waitingRate: rate.waitingRate,
      isActive: rate.isActive,
      effectiveDate: rate.effectiveDate ? rate.effectiveDate.split('T')[0] : '',
    })
    setFormOpen(true)
  }

  const handleAdd = () => {
    setSelectedRate(null)
    form.reset({
      zoneName: '', fromRegion: '', toRegion: '', ratePerKm: 0,
      minimumRate: 0, waitingRate: 0, isActive: true, effectiveDate: '',
    })
    setFormOpen(true)
  }

  const onSubmit = (data: ZoneRateFormValues) => {
    if (selectedRate) {
      updateMutation.mutate({ id: selectedRate.id, ...data })
    } else {
      createMutation.mutate(data)
    }
  }

  const filtered = rates.filter((r) => {
    const s = debouncedSearch.toLowerCase()
    return (
      r.zoneName.toLowerCase().includes(s) ||
      r.fromRegion.toLowerCase().includes(s) ||
      r.toRegion.toLowerCase().includes(s)
    )
  })

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  if (isLoading) return <PageSkeleton statsCount={0} filterRow tableRows={5} />

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <AlertCircle className="size-12 text-destructive" />
        <p className="text-muted-foreground">Failed to load zone rates</p>
        <Button variant="outline" onClick={() => refetch()}>Try Again</Button>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => setCurrentView('dashboard')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Dashboard</button>
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">Zone Rates</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Zone Rates</h1>
            {!isLoading && <span className="text-sm font-medium text-muted-foreground bg-muted rounded-full px-2.5 py-0.5">{rates.length}</span>}
          </div>
          <p className="text-muted-foreground text-sm">Manage transport zone pricing</p>
        </div>
        <Button onClick={handleAdd} size="sm">
          <Plus className="size-4" />
          Add Zone Rate
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by zone name or region..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <div className="relative mb-8">
                <div className="absolute -inset-6 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/20 dark:to-orange-900/20 blur-xl opacity-60" />
                <div className="relative size-24 rounded-2xl bg-muted flex items-center justify-center">
                  <MapPin className="size-12 opacity-30" />
                </div>
                <div className="absolute -top-1 -right-1 size-9 rounded-lg bg-muted/80 flex items-center justify-center">
                  <Calculator className="size-4.5 opacity-40" />
                </div>
                <div className="absolute -bottom-1 -left-1 size-9 rounded-lg bg-muted/80 flex items-center justify-center">
                  <Navigation className="size-4.5 opacity-40" />
                </div>
              </div>
              <p className="text-lg font-semibold">No zone rates found</p>
              <p className="text-sm mt-1 max-w-xs text-center">Define zone rates to auto-calculate trip amounts based on distance.</p>
              <ul className="text-xs text-muted-foreground mt-4 space-y-1.5">
                <li className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-muted-foreground/50" /> Set per-km rates between regions</li>
                <li className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-muted-foreground/50" /> Define minimum and waiting charges</li>
                <li className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-muted-foreground/50" /> Auto-fill trip amounts from zone rates</li>
              </ul>
              <div className="flex flex-col gap-2 mt-6">
                <Button size="sm" onClick={handleAdd}>
                  <Plus className="size-4" />
                  Add Your First Zone Rate
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setCurrentView('warehouses')}>
                  Set Up Warehouses First
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Zone Name</TableHead>
                      <TableHead>From → To</TableHead>
                      <TableHead className="text-right">Rate/Km</TableHead>
                      <TableHead className="text-right">Min Rate</TableHead>
                      <TableHead className="text-right">Waiting Rate</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((rate, idx) => (
                      <TableRow key={rate.id} className={cn('border-l-[3px] transition-colors hover:bg-muted/50', idx % 2 === 1 ? 'bg-muted/30' : '', rate.isActive ? 'border-l-emerald-500' : 'border-l-gray-400')}>
                        <TableCell className="font-medium">{rate.zoneName}</TableCell>
                        <TableCell>
                          <span className="text-muted-foreground">{rate.fromRegion}</span>
                          <span className="mx-1.5 text-muted-foreground">→</span>
                          <span>{rate.toRegion}</span>
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(rate.ratePerKm)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(rate.minimumRate)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(rate.waitingRate)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={rate.isActive ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50' : 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-700/50'}>
                            {rate.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(rate)}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => { setSelectedRate(rate); setDeleteOpen(true) }}>
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="md:hidden divide-y">
                {filtered.map((rate) => (
                  <div key={rate.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{rate.zoneName}</p>
                        <p className="text-sm text-muted-foreground">{rate.fromRegion} → {rate.toRegion}</p>
                      </div>
                      <Badge variant="outline" className={rate.isActive ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50' : 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-700/50'}>
                        {rate.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span>Rate/Km: <strong>{formatCurrency(rate.ratePerKm)}</strong></span>
                      <span>Min: {formatCurrency(rate.minimumRate)}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(rate)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setSelectedRate(rate); setDeleteOpen(true) }}>
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) { setSelectedRate(null); form.reset() } }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedRate ? 'Edit Zone Rate' : 'Add New Zone Rate'}</DialogTitle>
            <DialogDescription>
              {selectedRate ? 'Update zone rate pricing' : 'Define a new transport zone rate'}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="zoneName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Zone Name *</FormLabel>
                    <FormControl><Input {...field} placeholder="Accra-Tema Express" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="effectiveDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Effective Date *</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="fromRegion" render={({ field }) => (
                  <FormItem>
                    <FormLabel>From Region *</FormLabel>
                    <FormControl><Input {...field} placeholder="Greater Accra" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="toRegion" render={({ field }) => (
                  <FormItem>
                    <FormLabel>To Region *</FormLabel>
                    <FormControl><Input {...field} placeholder="Eastern Region" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="ratePerKm" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rate per Km (GHS) *</FormLabel>
                    <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="minimumRate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Minimum Rate (GHS) *</FormLabel>
                    <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="waitingRate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Waiting Rate per Hour (GHS)</FormLabel>
                    <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="isActive" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel>Active</FormLabel>
                    <p className="text-sm text-muted-foreground">Enable this rate for trip calculations</p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setFormOpen(false); form.reset() }}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                  {selectedRate ? 'Update Zone Rate' : 'Add Zone Rate'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Zone Rate</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{selectedRate?.zoneName}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedRate && deleteMutation.mutate(selectedRate.id)}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
