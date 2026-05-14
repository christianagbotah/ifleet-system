'use client'

import { useState } from 'react'
import { useDebounce } from '@/hooks/use-debounce'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  Warehouse,
  AlertCircle,
  Loader2,
  ChevronRight,
  MapPinned,
  Phone,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useAppStore } from '@/lib/store'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

interface WarehouseData {
  id: string
  name: string
  code: string
  address: string
  city: string
  region: string
  contactPerson?: string
  contactPhone?: string
  isActive: boolean
  notes: string
}

const warehouseSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  code: z.string().min(2, 'Code is required'),
  address: z.string().default(''),
  city: z.string().default(''),
  region: z.string().default(''),
  contactPerson: z.string().optional(),
  contactPhone: z.string().optional(),
  isActive: z.boolean().default(true),
  notes: z.string().default(''),
})

type WarehouseFormValues = z.infer<typeof warehouseSchema>

export default function WarehousesPage() {
  const queryClient = useQueryClient()
  const { setCurrentView } = useAppStore()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [formOpen, setFormOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedWarehouse, setSelectedWarehouse] = useState<WarehouseData | null>(null)

  // Listen for command palette "Add Warehouse" action
  useEffect(() => {
    const handler = () => setFormOpen(true)
    window.addEventListener('ifleetpro:open-form:warehouses', handler)
    return () => window.removeEventListener('ifleetpro:open-form:warehouses', handler)
  }, [])

  const { data: warehouses = [], isLoading, error, refetch } = useQuery<WarehouseData[]>({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const res = await fetch('/api/warehouses')
      if (!res.ok) throw new Error('Failed to fetch warehouses')
      return res.json()
    },
  })

  const form = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      name: '', code: '', address: '', city: '', region: '',
      contactPerson: '', contactPhone: '', isActive: true, notes: '',
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: WarehouseFormValues) => {
      const res = await fetch('/api/warehouses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create warehouse')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      toast.success('Warehouse created successfully')
      setFormOpen(false)
      form.reset()
    },
    onError: (err) => toast.error(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const res = await fetch(`/api/warehouses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update warehouse')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      toast.success('Warehouse updated successfully')
      setFormOpen(false)
      setSelectedWarehouse(null)
      form.reset()
    },
    onError: (err) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/warehouses/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete warehouse')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      toast.success('Warehouse deleted successfully')
      setDeleteOpen(false)
      setSelectedWarehouse(null)
    },
    onError: (err) => toast.error(err.message),
  })

  const handleEdit = (w: WarehouseData) => {
    setSelectedWarehouse(w)
    form.reset({
      name: w.name, code: w.code, address: w.address, city: w.city,
      region: w.region, contactPerson: w.contactPerson || '',
      contactPhone: w.contactPhone || '', isActive: w.isActive, notes: w.notes,
    })
    setFormOpen(true)
  }

  const handleAdd = () => {
    setSelectedWarehouse(null)
    form.reset({
      name: '', code: '', address: '', city: '', region: '',
      contactPerson: '', contactPhone: '', isActive: true, notes: '',
    })
    setFormOpen(true)
  }

  const onSubmit = (data: WarehouseFormValues) => {
    if (selectedWarehouse) {
      updateMutation.mutate({ id: selectedWarehouse.id, ...data })
    } else {
      createMutation.mutate(data)
    }
  }

  const filtered = warehouses.filter((w) => {
    const s = debouncedSearch.toLowerCase()
    return (
      w.name.toLowerCase().includes(s) ||
      w.code.toLowerCase().includes(s) ||
      w.city.toLowerCase().includes(s) ||
      w.region.toLowerCase().includes(s)
    )
  })

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  if (isLoading) return <PageSkeleton statsCount={0} filterRow tableRows={5} />

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <AlertCircle className="size-12 text-destructive" />
        <p className="text-muted-foreground">Failed to load warehouses</p>
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
            <span className="text-sm font-medium">Warehouses</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Warehouses</h1>
            {!isLoading && <span className="text-sm font-medium text-muted-foreground bg-muted rounded-full px-2.5 py-0.5">{warehouses.length}</span>}
          </div>
          <p className="text-muted-foreground text-sm">Manage warehouse locations</p>
        </div>
        <Button onClick={handleAdd} size="sm">
          <Plus className="size-4" />
          Add Warehouse
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, code, city, or region..."
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
                <div className="absolute -inset-6 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/20 dark:to-teal-900/20 blur-xl opacity-60" />
                <div className="relative size-24 rounded-2xl bg-muted flex items-center justify-center">
                  <Warehouse className="size-12 opacity-30" />
                </div>
                <div className="absolute -top-1 -right-1 size-9 rounded-lg bg-muted/80 flex items-center justify-center">
                  <MapPinned className="size-4.5 opacity-40" />
                </div>
                <div className="absolute -bottom-1 -left-1 size-9 rounded-lg bg-muted/80 flex items-center justify-center">
                  <Phone className="size-4.5 opacity-40" />
                </div>
              </div>
              <p className="text-lg font-semibold">No warehouses found</p>
              <p className="text-sm mt-1 max-w-xs text-center">Set up warehouse locations as pickup and delivery points for trips.</p>
              <ul className="text-xs text-muted-foreground mt-4 space-y-1.5">
                <li className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-muted-foreground/50" /> Define origin and destination points</li>
                <li className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-muted-foreground/50" /> Auto-calculate zone-based trip rates</li>
                <li className="flex items-center gap-1.5"><span className="size-1 rounded-full bg-muted-foreground/50" /> Manage contact details for each location</li>
              </ul>
              <div className="flex flex-col gap-2 mt-6">
                <Button size="sm" onClick={handleAdd}>
                  <Plus className="size-4" />
                  Add Your First Warehouse
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setCurrentView('zone-rates')}>
                  Set Up Zone Rates
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((w, idx) => (
                      <TableRow key={w.id} className={cn('border-l-[3px] transition-colors hover:bg-muted/50', idx % 2 === 1 ? 'bg-muted/30' : '', w.isActive ? 'border-l-emerald-500' : 'border-l-gray-400')}>
                        <TableCell className="font-mono font-medium">{w.code}</TableCell>
                        <TableCell>{w.name}</TableCell>
                        <TableCell>{w.city || '—'}</TableCell>
                        <TableCell>{w.region || '—'}</TableCell>
                        <TableCell>{w.contactPerson || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={w.isActive ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50' : 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-700/50'}>
                            {w.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(w)}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => { setSelectedWarehouse(w); setDeleteOpen(true) }}>
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
                {filtered.map((w) => (
                  <div key={w.id} className={cn('p-4 space-y-3 border-l-[3px] transition-colors active:bg-muted/50', w.isActive ? 'border-l-emerald-500' : 'border-l-gray-400')}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0 mr-2">
                        <p className="font-semibold truncate">{w.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-[10px] px-1.5 font-mono">{w.code}</Badge>
                          {w.region && (
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <MapPinned className="size-3" />
                              {w.region}
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className={cn('shrink-0 text-[10px] px-1.5', w.isActive ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50' : 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-700/50')}>
                        {w.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(w)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setSelectedWarehouse(w); setDeleteOpen(true) }}>
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
      <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) { setSelectedWarehouse(null); form.reset() } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedWarehouse ? 'Edit Warehouse' : 'Add New Warehouse'}</DialogTitle>
            <DialogDescription>
              {selectedWarehouse ? 'Update warehouse information' : 'Fill in warehouse details'}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl><Input {...field} placeholder="Accra Main Depot" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="code" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code *</FormLabel>
                    <FormControl><Input {...field} placeholder="ACC-001" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="city" render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl><Input {...field} placeholder="Accra" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="region" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Region</FormLabel>
                    <FormControl><Input {...field} placeholder="Greater Accra" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="contactPerson" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Person</FormLabel>
                    <FormControl><Input {...field} placeholder="John Doe" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="contactPhone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Phone</FormLabel>
                    <FormControl><Input {...field} placeholder="024 000 0000" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl><Input {...field} placeholder="Full address" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="isActive" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel>Active</FormLabel>
                    <p className="text-sm text-muted-foreground">Enable this warehouse for trip assignments</p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea {...field} placeholder="Additional notes..." rows={3} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setFormOpen(false); form.reset() }}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                  {selectedWarehouse ? 'Update Warehouse' : 'Add Warehouse'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Warehouse</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{selectedWarehouse?.name}</strong> ({selectedWarehouse?.code})? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedWarehouse && deleteMutation.mutate(selectedWarehouse.id)}
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
