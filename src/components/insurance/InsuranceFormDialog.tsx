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
import { Label } from '@/components/ui/label'
import { SearchableSelect, type SearchableOption } from '@/components/ui/searchable-select'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, ShieldCheck } from 'lucide-react'
import { INSURANCE_TYPES } from '@/lib/constants'
import { useCurrency } from '@/lib/currency-context'
import { useAuthStore } from '@/lib/store/auth'
import { useDriverTruck } from '@/hooks/useDriverTruck'
import { toast } from 'sonner'

interface InsuranceFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  insurance?: {
    id: string
    truckId: string
    truck: { id: string; plateNumber: string; make: string; model: string }
    provider: string
    policyNumber: string
    type: string
    coverAmount?: number | null
    premium: number
    startDate: string
    endDate: string
    status: string
    documentUrl?: string | null
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

const INSURANCE_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function InsuranceFormDialog({ open, onOpenChange, insurance, onSuccess }: InsuranceFormDialogProps) {
  const { currencySymbol } = useCurrency()
  const isEditing = !!insurance
  const { isDriver, assignedTruckId } = useDriverTruck()
  const [submitting, setSubmitting] = useState(false)
  const [trucks, setTrucks] = useState<TruckOption[]>([])
  const [loadingTrucks, setLoadingTrucks] = useState(false)

  // Form fields
  const [truckId, setTruckId] = useState('')
  const [provider, setProvider] = useState('')
  const [policyNumber, setPolicyNumber] = useState('')
  const [type, setType] = useState('')
  const [coverAmount, setCoverAmount] = useState('')
  const [premium, setPremium] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [status, setStatus] = useState('active')
  const [notes, setNotes] = useState('')

  // Load trucks for the dropdown
  useEffect(() => {
    if (open) {
      setLoadingTrucks(true)
      const { user } = useAuthStore.getState()
      const driverId = user?.role === 'Driver' && user.driverId ? user.driverId : undefined
      const url = driverId
        ? `/api/trucks?limit=100&status=active&driverId=${driverId}`
        : '/api/trucks?limit=100&status=active'
      fetch(url)
        .then(r => r.json())
        .then(res => {
          setTrucks(res.data || [])
          // For drivers, pre-fill with assigned truck
          if (isDriver && assignedTruckId && !isEditing) {
            setTruckId(assignedTruckId)
          }
        })
        .catch(() => toast.error('Failed to load trucks'))
        .finally(() => setLoadingTrucks(false))
    }
  }, [open, isDriver, assignedTruckId, isEditing])

  // Pre-fill form when editing
  useEffect(() => {
    if (insurance && open) {
      setTruckId(insurance.truckId)
      setProvider(insurance.provider)
      setPolicyNumber(insurance.policyNumber)
      setType(insurance.type)
      setCoverAmount(insurance.coverAmount != null ? String(insurance.coverAmount) : '')
      setPremium(String(insurance.premium))
      setStartDate(insurance.startDate ? new Date(insurance.startDate).toISOString().split('T')[0] : '')
      setEndDate(insurance.endDate ? new Date(insurance.endDate).toISOString().split('T')[0] : '')
      setStatus(insurance.status || 'active')
      setNotes(insurance.notes || '')
    } else if (!insurance && open) {
      resetForm()
    }
  }, [insurance, open])

  function resetForm() {
    setTruckId('')
    setProvider('')
    setPolicyNumber('')
    setType('')
    setCoverAmount('')
    setPremium('')
    setStartDate('')
    setEndDate('')
    setStatus('active')
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
    if (!provider.trim()) { toast.error('Provider is required'); return }
    if (!policyNumber.trim()) { toast.error('Policy number is required'); return }
    if (!type) { toast.error('Insurance type is required'); return }
    if (!premium || parseFloat(premium) <= 0) { toast.error('Valid premium amount is required'); return }
    if (!startDate) { toast.error('Start date is required'); return }
    if (!endDate) { toast.error('End date is required'); return }

    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        truckId,
        provider: provider.trim(),
        policyNumber: policyNumber.trim(),
        type,
        premium: parseFloat(premium),
        startDate,
        endDate,
      }

      if (coverAmount) body.coverAmount = parseFloat(coverAmount)
      if (isEditing) body.status = status
      if (notes.trim()) body.notes = notes.trim()

      const url = isEditing ? `/api/insurance/${insurance!.id}` : '/api/insurance'
      const method = isEditing ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Operation failed' }))
        throw new Error(err.error || 'Operation failed')
      }

      toast.success(isEditing ? 'Insurance policy updated successfully' : 'Insurance policy added successfully')
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save insurance policy')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            {isEditing ? 'Edit Insurance Policy' : 'Add New Insurance Policy'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? `Update details for policy ${insurance?.policyNumber}`
              : 'Enter the details for a new insurance policy'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <DialogBody className="space-y-4">
          {/* Truck Selection */}
          <div className="space-y-2">
            <Label>Truck <span className="text-destructive">*</span></Label>
            <SearchableSelect
              placeholder={loadingTrucks ? 'Loading trucks...' : 'Select a truck'}
              searchPlaceholder="Search trucks..."
              emptyMessage="No trucks found"
              value={truckId}
              onValueChange={setTruckId}
              options={truckOptions}
              disabled={loadingTrucks || isDriver}
            />
          </div>

          {/* Provider & Policy Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="insurance-provider">Provider <span className="text-destructive">*</span></Label>
              <Input
                id="insurance-provider"
                placeholder="e.g., SIC Insurance"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="insurance-policy">Policy Number <span className="text-destructive">*</span></Label>
              <Input
                id="insurance-policy"
                placeholder="e.g., SIC-2024-001"
                value={policyNumber}
                onChange={(e) => setPolicyNumber(e.target.value)}
              />
            </div>
          </div>

          {/* Type & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Insurance Type <span className="text-destructive">*</span></Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {INSURANCE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isEditing && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INSURANCE_STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Cover Amount & Premium */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="insurance-cover">
                Cover Amount
                <span className="text-muted-foreground font-normal ml-1">({currencySymbol})</span>
              </Label>
              <Input
                id="insurance-cover"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={coverAmount}
                onChange={(e) => setCoverAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="insurance-premium">
                Premium <span className="text-destructive">*</span>
                <span className="text-muted-foreground font-normal ml-1">({currencySymbol})</span>
              </Label>
              <Input
                id="insurance-premium"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={premium}
                onChange={(e) => setPremium(e.target.value)}
              />
            </div>
          </div>

          {/* Start Date & End Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="insurance-start">Start Date <span className="text-destructive">*</span></Label>
              <Input
                id="insurance-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="insurance-end">End Date <span className="text-destructive">*</span></Label>
              <Input
                id="insurance-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="insurance-notes">Notes</Label>
            <textarea
              id="insurance-notes"
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              placeholder="Any additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          </DialogBody>

          <DialogFooter>
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
              'Update Policy'
            ) : (
              'Add Policy'
            )}
          </Button>
        </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
