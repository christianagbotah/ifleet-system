'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Dialog,
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
import { Loader2, CircleDot, Plus, Trash2, ArrowDown, CalendarIcon, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCurrency } from '@/lib/currency-context'
import { useAuthStore } from '@/lib/store/auth'
import { useDriverTruck } from '@/hooks/useDriverTruck'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'

interface BulkTyreFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

interface TruckOption {
  id: string
  plateNumber: string
  make: string
  model: string
}

interface TyreRow {
  id: string
  serialNumber: string
  brand: string
  purchasePrice: string
  purchaseDate: string
  condition: string
}

const CONDITIONS = [
  { value: 'new', label: 'New' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'worn', label: 'Worn' },
]

function createEmptyRow(index: number): TyreRow {
  return {
    id: `row-${Date.now()}-${index}`,
    serialNumber: '',
    brand: '',
    purchasePrice: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    condition: 'new',
  }
}

export function BulkTyreFormDialog({ open, onOpenChange, onCreated }: BulkTyreFormDialogProps) {
  const { currencySymbol } = useCurrency()
  const { isDriver, assignedTruckId } = useDriverTruck()
  const [submitting, setSubmitting] = useState(false)
  const [trucks, setTrucks] = useState<TruckOption[]>([])
  const [loadingTrucks, setLoadingTrucks] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  // Truck selection (common for all tyres)
  const [truckId, setTruckId] = useState('')

  // Bulk-set fields at the top (no condition)
  const [bulkBrand, setBulkBrand] = useState('')
  const [bulkPrice, setBulkPrice] = useState('')
  const [bulkSerial, setBulkSerial] = useState('')
  const [bulkDate, setBulkDate] = useState(new Date().toISOString().split('T')[0])

  // Individual tyre rows
  const [rows, setRows] = useState<TyreRow[]>(() =>
    Array.from({ length: 6 }, (_, i) => createEmptyRow(i))
  )

  // Load trucks
  useEffect(() => {
    if (open) {
      setLoadingTrucks(true)
      const { user } = useAuthStore.getState()
      const driverId = user?.role === 'Driver' && user.driverId ? user.driverId : undefined
      const url = driverId
        ? `/api/trucks?limit=500&driverId=${driverId}`
        : '/api/trucks?limit=500'
      apiFetch<{ data: typeof trucks }>(url)
        .then(res => {
          setTrucks(res.data || [])
          if (isDriver && assignedTruckId) setTruckId(assignedTruckId)
        })
        .catch((err) => toast.error(err?.message || 'Failed to load trucks'))
        .finally(() => setLoadingTrucks(false))
    }
  }, [open, isDriver, assignedTruckId])

  // Reset on open
  useEffect(() => {
    if (open) {
      setTruckId('')
      setBulkBrand('')
      setBulkPrice('')
      setBulkSerial('')
      setBulkDate(new Date().toISOString().split('T')[0])
      setErrors([])
      setRows(Array.from({ length: 6 }, (_, i) => createEmptyRow(i)))
    }
  }, [open])

  // Pre-fill driver truck
  useEffect(() => {
    if (isDriver && assignedTruckId && trucks.length > 0 && !truckId) {
      setTruckId(assignedTruckId)
    }
  }, [isDriver, assignedTruckId, trucks, truckId])

  const truckOptions: SearchableOption[] = useMemo(() => [
    ...(trucks || []).map((t): SearchableOption => ({
      value: t.id,
      label: `${t.plateNumber} — ${t.make} ${t.model}`,
    })),
  ], [trucks])

  // Update a single field in a specific row
  const updateRow = useCallback((rowId: string, field: keyof TyreRow, value: string) => {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, [field]: value } : r))
    // Clear errors when user edits
    setErrors(prev => prev.filter(e => !e.includes(rowId)))
  }, [])

  // Add a new row
  const addRow = useCallback(() => {
    setRows(prev => [...prev, createEmptyRow(prev.length)])
  }, [])

  // Remove a row
  const removeRow = useCallback((rowId: string) => {
    setRows(prev => {
      if (prev.length <= 1) {
        toast.error('Must have at least one row')
        return prev
      }
      return prev.filter(r => r.id !== rowId)
    })
  }, [])

  // Apply bulk brand to all rows
  const applyBrandToAll = useCallback(() => {
    if (!bulkBrand.trim()) { toast.error('Enter a brand first'); return }
    setRows(prev => prev.map(r => ({ ...r, brand: bulkBrand.trim() })))
    toast.success(`Brand "${bulkBrand.trim()}" applied to all rows`)
  }, [bulkBrand])

  // Apply bulk price to all rows
  const applyPriceToAll = useCallback(() => {
    const price = parseFloat(bulkPrice)
    if (!bulkPrice || isNaN(price) || price <= 0) { toast.error('Enter a valid price first'); return }
    setRows(prev => prev.map(r => ({ ...r, purchasePrice: bulkPrice })))
    toast.success(`Price ${currencySymbol}${parseFloat(bulkPrice).toLocaleString()} applied to all rows`)
  }, [bulkPrice, currencySymbol])

  // Apply bulk serial to all rows — auto-increment suffix to avoid duplicates
  const applySerialToAll = useCallback(() => {
    if (!bulkSerial.trim()) { toast.error('Enter a serial number first'); return }
    const base = bulkSerial.trim()
    const validRows = rows.filter(r => r.serialNumber.trim())
    if (validRows.length === 0) {
      // No rows have serials yet — apply base + row index
      setRows(prev => prev.map((r, i) => ({ ...r, serialNumber: `${base}-${String(i + 1).padStart(2, '0')}` })))
      toast.success(`Serial "${base}" applied with auto-numbering to all rows`)
    } else {
      // Apply base + incremental suffix
      setRows(prev => prev.map((r, i) => ({ ...r, serialNumber: `${base}-${String(i + 1).padStart(2, '0')}` })))
      toast.success(`Serial "${base}" applied with auto-numbering to all rows`)
    }
  }, [bulkSerial, rows])

  // Apply bulk date to all rows
  const applyDateToAll = useCallback(() => {
    if (!bulkDate) { toast.error('Select a date first'); return }
    setRows(prev => prev.map(r => ({ ...r, purchaseDate: bulkDate })))
    toast.success('Date applied to all rows')
  }, [bulkDate])

  // Apply ALL bulk fields at once
  const applyAllToAll = useCallback(() => {
    let applied = false
    setRows(prev => prev.map((r, i) => {
      const updated = { ...r }
      if (bulkSerial.trim()) { updated.serialNumber = `${bulkSerial.trim()}-${String(i + 1).padStart(2, '0')}`; applied = true }
      if (bulkBrand.trim()) { updated.brand = bulkBrand.trim(); applied = true }
      if (bulkPrice && !isNaN(parseFloat(bulkPrice)) && parseFloat(bulkPrice) > 0) { updated.purchasePrice = bulkPrice; applied = true }
      if (bulkDate) { updated.purchaseDate = bulkDate; applied = true }
      return updated
    }))
    if (applied) {
      toast.success('All fields applied to all rows')
    } else {
      toast.error('Fill in at least one bulk field')
    }
  }, [bulkBrand, bulkPrice, bulkSerial, bulkDate])

  // Calculate total price
  const totalPrice = useMemo(() => {
    return rows.reduce((sum, r) => {
      const price = parseFloat(r.purchasePrice)
      return sum + (isNaN(price) ? 0 : price)
    }, 0)
  }, [rows])

  // Count valid rows (have serial number)
  const validRowCount = useMemo(() => {
    return rows.filter(r => r.serialNumber.trim()).length
  }, [rows])

  // Detect duplicate serial numbers among rows
  const duplicateSerials = useMemo(() => {
    const serials = rows.filter(r => r.serialNumber.trim()).map(r => r.serialNumber.trim())
    const seen = new Set<string>()
    const duplicates = new Set<string>()
    for (const s of serials) {
      if (seen.has(s)) duplicates.add(s)
      else seen.add(s)
    }
    return duplicates
  }, [rows])

  function validate(): boolean {
    const errs: string[] = []
    if (!truckId) { toast.error('Please select a truck'); return false }
    const validRows = rows.filter(r => r.serialNumber.trim())
    if (validRows.length === 0) { toast.error('Please enter at least one serial number'); return false }

    // Check for duplicate serials within the form
    if (duplicateSerials.size > 0) {
      const dupList = Array.from(duplicateSerials).join(', ')
      errs.push(`Duplicate serial numbers: ${dupList}`)
      toast.error(`Duplicate serial numbers detected: ${dupList}`)
      setErrors(errs)
      return false
    }

    for (const row of validRows) {
      if (!row.brand.trim()) { toast.error(`Row with serial "${row.serialNumber}" needs a brand`); return false }
      const price = parseFloat(row.purchasePrice)
      if (!row.purchasePrice || isNaN(price) || price <= 0) { toast.error(`Row with serial "${row.serialNumber}" needs a valid price`); return false }
      if (!row.purchaseDate) { toast.error(`Row with serial "${row.serialNumber}" needs a date`); return false }
    }
    setErrors([])
    return true
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    setErrors([])
    let successCount = 0
    let failCount = 0
    const failMessages: string[] = []
    const validRows = rows.filter(r => r.serialNumber.trim())

    try {
      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i]
        try {
          const res = await apiFetch('/api/tyres', {
            method: 'POST',
            body: JSON.stringify({
              truckId,
              serialNumber: row.serialNumber.trim(),
              brand: row.brand.trim(),
              purchaseDate: row.purchaseDate,
              purchasePrice: parseFloat(row.purchasePrice),
              condition: row.condition,
            }),
          })
          successCount++
        } catch (err) {
          failCount++
          const msg = err instanceof Error ? err.message : 'Unknown error'
          failMessages.push(`Row ${i + 1} (${row.serialNumber}): ${msg}`)
        }
      }

      if (successCount > 0) {
        if (failCount === 0) {
          toast.success(`${successCount} tyres added successfully!`)
        } else {
          toast.warning(`${successCount} added, ${failCount} failed`)
          setErrors(failMessages)
        }
        if (failCount === 0) {
          onCreated()
          onOpenChange(false)
        }
      } else if (failCount > 0) {
        toast.error(`All ${failCount} rows failed`)
        setErrors(failMessages)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save tyres')
    } finally {
      setSubmitting(false)
    }
  }

  // Ref for the submit button outside the form
  const formRef = React.useRef<HTMLFormElement>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <CircleDot className="h-5 w-5 text-amber-500" />
            Bulk Add Tyres
          </DialogTitle>
          <DialogDescription>
            Set fields at the top and apply to all rows, or edit each tyre individually.
          </DialogDescription>
        </DialogHeader>

        {/* Error messages */}
        {errors.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-3 shrink-0">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <div className="space-y-1 flex-1 min-w-0">
                <p className="text-sm font-medium text-red-700 dark:text-red-400">
                  {errors.length} error{errors.length !== 1 ? 's' : ''} occurred
                </p>
                <div className="max-h-24 overflow-y-auto">
                  {errors.map((err, i) => (
                    <p key={i} className="text-xs text-red-600 dark:text-red-300">{err}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable body */}
        <form id="bulk-tyre-form" ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4 overflow-y-auto flex-1 min-h-0 pr-2">
          {/* Truck selection */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Truck <span className="text-destructive">*</span></Label>
            <SearchableSelect
              placeholder={loadingTrucks ? 'Loading trucks...' : 'Select truck'}
              searchPlaceholder="Search trucks..."
              emptyMessage="No trucks found"
              value={truckId}
              onValueChange={setTruckId}
              options={truckOptions}
              disabled={loadingTrucks || isDriver}
              alwaysSearchable
            />
          </div>

          {/* Bulk-set section — compact row of fields + apply buttons (no condition) */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ArrowDown className="h-4 w-4" />
              Quick Fill — Apply to All Rows
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* Serial */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Serial Number</Label>
                <div className="flex gap-1">
                  <Input
                    placeholder="e.g. MICH-2025"
                    className="h-8 text-sm"
                    value={bulkSerial}
                    onChange={e => setBulkSerial(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 px-2 shrink-0"
                    onClick={applySerialToAll}
                    title="Apply serial to all rows (auto-numbered)"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Brand */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Brand</Label>
                <div className="flex gap-1">
                  <Input
                    placeholder="e.g. Michelin"
                    className="h-8 text-sm"
                    value={bulkBrand}
                    onChange={e => setBulkBrand(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 px-2 shrink-0"
                    onClick={applyBrandToAll}
                    title="Apply brand to all rows"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Price */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Price ({currencySymbol})</Label>
                <div className="flex gap-1">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="h-8 text-sm"
                    value={bulkPrice}
                    onChange={e => setBulkPrice(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 px-2 shrink-0"
                    onClick={applyPriceToAll}
                    title="Apply price to all rows"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Date */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Date</Label>
                <div className="flex gap-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 text-sm font-normal justify-start text-left w-full"
                      >
                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                        {bulkDate ? format(new Date(bulkDate + 'T00:00:00'), 'dd MMM yyyy') : 'Pick date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={bulkDate ? new Date(bulkDate + 'T00:00:00') : undefined}
                        onSelect={(date) => {
                          if (date) setBulkDate(format(date, 'yyyy-MM-dd'))
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 px-2 shrink-0"
                    onClick={applyDateToAll}
                    title="Apply date to all rows"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Apply All button */}
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={applyAllToAll}
              >
                Apply All Fields to All Rows
              </Button>
            </div>
          </div>

          {/* Duplicate serial warning */}
          {duplicateSerials.size > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-2.5 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Duplicate serial number{duplicateSerials.size > 1 ? 's' : ''}: <strong>{Array.from(duplicateSerials).join(', ')}</strong>. Each tyre must have a unique serial number.
              </p>
            </div>
          )}

          {/* Tyre rows — table-like layout */}
          <div className="flex flex-col">
            <div className="rounded-lg border overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[2rem_1fr_1fr_100px_120px_90px_2rem] gap-1 bg-muted/50 px-2 py-2 text-xs font-medium text-muted-foreground border-b sticky top-0 z-10">
                <span>#</span>
                <span>Serial Number *</span>
                <span>Brand *</span>
                <span>Price *</span>
                <span>Date *</span>
                <span>Condition</span>
                <span></span>
              </div>

              {/* Scrollable rows */}
              <div className="max-h-[45vh] overflow-y-auto">
                {rows.map((row, index) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-[2rem_1fr_1fr_100px_120px_90px_2rem] gap-1 px-2 py-2 border-b last:border-b-0 hover:bg-muted/20 transition-colors items-center"
                  >
                    {/* Row number */}
                    <span className="text-xs text-muted-foreground text-center font-mono">
                      {index + 1}
                    </span>

                    {/* Serial Number */}
                    <Input
                      placeholder="Enter serial #"
                      className="h-8 text-sm"
                      value={row.serialNumber}
                      onChange={e => updateRow(row.id, 'serialNumber', e.target.value)}
                    />

                    {/* Brand */}
                    <Input
                      placeholder="Brand"
                      className="h-8 text-sm"
                      value={row.brand}
                      onChange={e => updateRow(row.id, 'brand', e.target.value)}
                    />

                    {/* Price */}
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="h-8 text-sm"
                      value={row.purchasePrice}
                      onChange={e => updateRow(row.id, 'purchasePrice', e.target.value)}
                    />

                    {/* Date Picker */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 text-xs font-normal justify-start text-left w-full"
                        >
                          <CalendarIcon className="mr-1 h-3 w-3 shrink-0" />
                          {row.purchaseDate ? format(new Date(row.purchaseDate + 'T00:00:00'), 'dd MMM') : 'Date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={row.purchaseDate ? new Date(row.purchaseDate + 'T00:00:00') : undefined}
                          onSelect={(date) => {
                            if (date) updateRow(row.id, 'purchaseDate', format(date, 'yyyy-MM-dd'))
                          }}
                        />
                      </PopoverContent>
                    </Popover>

                    {/* Condition */}
                    <Select
                      value={row.condition}
                      onValueChange={val => updateRow(row.id, 'condition', val)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONDITIONS.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Delete button */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(row.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Add row button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 h-9 text-xs w-full"
              onClick={addRow}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Row
            </Button>
          </div>
        </form>

        {/* Summary bar — pinned at bottom */}
        <div className="flex items-center justify-between rounded-lg border bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 shrink-0 mt-2">
          <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
            {rows.length} {rows.length === 1 ? 'row' : 'rows'} ({validRowCount} with serial)
            {duplicateSerials.size > 0 && (
              <span className="text-red-600 dark:text-red-400 ml-2">
                ⚠ {duplicateSerials.size} duplicate{duplicateSerials.size > 1 ? 's' : ''}
              </span>
            )}
          </span>
          <span className="text-sm font-bold text-amber-700 dark:text-amber-400">
            Total: {currencySymbol}{totalPrice.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        </div>

        {/* Footer — pinned at bottom */}
        <DialogFooter className="flex-col sm:flex-row gap-2 shrink-0 border-t pt-3 px-6 md:px-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="bulk-tyre-form"
            disabled={submitting || duplicateSerials.size > 0}
          >
            {submitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding tyres...</>
            ) : (
              <><Plus className="mr-2 h-4 w-4" />Add {validRowCount} {validRowCount === 1 ? 'Tyre' : 'Tyres'}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
