'use client'

import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { SearchableSelect, type SearchableOption } from '@/components/ui/searchable-select'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, CircleDot, Trash2 } from 'lucide-react'
import { TYRE_CONDITIONS } from '@/lib/constants'
import { useCurrency } from '@/lib/currency-context'
import { useAuthStore } from '@/lib/store/auth'
import { useDriverTruck } from '@/hooks/useDriverTruck'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'

interface TyreFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tyre?: {
    id: string
    truckId: string
    truck: { id: string;
plateNumber: string; make: string; model: string }
    serialNumber: string
    brand: string
    purchaseDate: string
    purchasePrice: number
    condition: string
    notes?: string | null
  } | null
  onSuccess: () => void
}

interface TruckOption {
  id: string
  plateNumber: string
  make: string
  model: string
}

export function TyreFormDialog({ open, onOpenChange, tyre, onSuccess }: TyreFormDialogProps) {
  const { currencySymbol } = useCurrency()
  const isEditing = !!tyre
  const { isDriver, assignedTruckId } = useDriverTruck()
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [trucks, setTrucks] = useState<TruckOption[]>([])
  const [loadingTrucks, setLoadingTrucks] = useState(false)

  // Form fields
  const [truckId, setTruckId] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [brand, setBrand] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [condition, setCondition] = useState('new')
  const [retiredReason, setRetiredReason] = useState('')
  const [notes, setNotes] = useState('')

  // Load trucks for the dropdown - load ALL trucks (not just active)
  useEffect(() => {
    if (open) {
      setLoadingTrucks(true)
      const { user } = useAuthStore.getState()
      const driverId = user?.role === 'Driver' && user.driverId ? user.driverId : undefined
      // For drivers, only show their assigned truck; for others, show all trucks
      const url = driverId
        ? `/api/trucks?limit=500&driverId=${driverId}`
        : '/api/trucks?limit=500'
      apiFetch<{ data: typeof trucks }>(url)
        .then(res => {
          setTrucks(res.data || [])
          // For drivers, pre-fill with assigned truck
          if (isDriver && assignedTruckId && !isEditing) {
            setTruckId(assignedTruckId)
          }
        })
        .catch((err) => toast.error(err?.message || 'Failed to load trucks'))
        .finally(() => setLoadingTrucks(false))
    }
  }, [open, isDriver, assignedTruckId, isEditing])

  // Pre-fill form when editing
  useEffect(() => {
    if (tyre && open) {
      setTruckId(tyre.truckId)
      setSerialNumber(tyre.serialNumber)
      setBrand(tyre.brand)
      setPurchaseDate(tyre.purchaseDate ? new Date(tyre.purchaseDate).toISOString().split('T')[0] : '')
      setPurchasePrice(String(tyre.purchasePrice))
      setCondition(tyre.condition || 'new')
      setRetiredReason(tyre.retiredReason || '')
      setNotes(tyre.notes || '')
    } else if (!tyre && open) {
      resetForm()
    }
  }, [tyre, open])

  function resetForm() {
    setTruckId('')
    setSerialNumber('')
    setBrand('')
    setPurchaseDate(new Date().toISOString().split('T')[0])
    setPurchasePrice('')
    setCondition('new')
    setRetiredReason('')
    setNotes('')
  }

  const truckOptions: SearchableOption[] = [
    ...(trucks || []).map((t): SearchableOption => ({
      value: t.id,
      label: `${t.plateNumber} — ${t.make} ${t.model}`,
    })),
  ]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!truckId) { toast.error('Please select a truck'); return }
    if (!serialNumber.trim()) { toast.error('Serial number is required'); return }
    if (!brand.trim()) { toast.error('Brand is required'); return }
    if (!purchaseDate) { toast.error('Purchase date is required'); return }
    if (!purchasePrice || parseFloat(purchasePrice) <= 0) { toast.error('Valid purchase price is required'); return }

    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        truckId,
        serialNumber: serialNumber.trim(),
        brand: brand.trim(),
        purchaseDate,
        purchasePrice: parseFloat(purchasePrice),
      }

      if (isEditing) {
        body.condition = condition
        if (notes.trim()) body.notes = notes.trim()
        else body.notes = ''
        if (retiredReason.trim()) body.retiredReason = retiredReason.trim()
        else body.retiredReason = ''
      } else {
        if (notes.trim()) body.notes = notes.trim()
      }

      const url = isEditing ? `/api/tyres/${tyre!.id}` : '/api/tyres'
      const method = isEditing ? 'PUT' : 'POST'

      await apiFetch(url, {
        method,
        body: JSON.stringify(body),
      })

      toast.success(isEditing ? 'Tyre updated successfully' : 'Tyre added successfully')
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save tyre')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!tyre) return
    setDeleting(true)
    try {
      await apiFetch(`/api/tyres/${tyre.id}`, { method: 'DELETE' })
      toast.success('Tyre deleted successfully')
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete tyre')
    } finally {
      setDeleting(false)
    }
  }

  const isRetired = isEditing && (condition === 'damaged' || condition === 'replaced')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleDot className="h-5 w-5 text-amber-500" />
            {isEditing ? 'Edit Tyre' : 'Add New Tyre'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? `Update details for tyre ${tyre?.serialNumber}`
              : 'Enter the details for a new tyre record'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <DialogBody className="space-y-4">
            {/* Truck Selection */}
            <div className="space-y-2">
              <Label>Truck <span className="text-destructive">*</span></Label>
              <SearchableSelect
                placeholder={loadingTrucks ? 'Loading trucks...' : 'Select a truck'}
                searchPlaceholder="Search trucks by plate number or make..."
                emptyMessage="No trucks found"
                value={truckId}
                onValueChange={setTruckId}
                options={truckOptions}
                disabled={loadingTrucks || isDriver}
                alwaysSearchable
              />
            </div>

            {/* Serial Number & Brand */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tyre-serial">Serial Number <span className="text-destructive">*</span></Label>
                <Input
                  id="tyre-serial"
                  placeholder="e.g., MIC-29580R225"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tyre-brand">Brand <span className="text-destructive">*</span></Label>
                <Input
                  id="tyre-brand"
                  placeholder="e.g., Michelin, Continental"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                />
              </div>
            </div>

            {/* Purchase Date & Price */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tyre-date">Purchase Date <span className="text-destructive">*</span></Label>
                <DatePicker value={purchaseDate} onChange={(val) => setPurchaseDate(val)} id="tyre-date" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tyre-price">
                  Purchase Price <span className="text-destructive">*</span>
                  <span className="text-muted-foreground font-normal ml-1">({currencySymbol})</span>
                </Label>
                <Input
                  id="tyre-price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                />
              </div>
            </div>

            {/* Condition (edit only) */}
            {isEditing && (
              <div className="space-y-2">
                <Label>Condition</Label>
                <Select value={condition} onValueChange={setCondition}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYRE_CONDITIONS).map(([key, val]) => (
                      <SelectItem key={key} value={key}>{val.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Retired Reason (shown when condition is damaged/replaced) */}
            {isRetired && (
              <div className="space-y-2">
                <Label htmlFor="tyre-retired-reason">Retirement / Damage Reason</Label>
                <Input
                  id="tyre-retired-reason"
                  placeholder="e.g., Sidewall damage, beyond repair"
                  value={retiredReason}
                  onChange={(e) => setRetiredReason(e.target.value)}
                />
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="tyre-notes">Notes</Label>
              <textarea
                id="tyre-notes"
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                placeholder="Any additional notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </DialogBody>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {isEditing && (
              <Button
                type="button"
                variant="destructive"
                className="sm:mr-auto"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </>
                )}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : isEditing ? (
                'Update Tyre'
              ) : (
                'Add Tyre'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
