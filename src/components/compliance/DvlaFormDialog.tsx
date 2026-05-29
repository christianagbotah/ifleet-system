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
import { Textarea } from '@/components/ui/textarea'
import { SearchableSelect, type SearchableOption } from '@/components/ui/searchable-select'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Car } from 'lucide-react'
import { APP_COMPANY } from '@/lib/constants'
import { apiFetch } from '@/lib/api'
import { DatePicker } from '@/components/ui/date-picker'
import { toast } from 'sonner'

// ─── Exported Types ───────────────────────────────────────────────────────
export interface DvlaRegistration {
  id: string
  truckId: string
  registrationNumber: string
  certificateNumber: string
  vehicleClass: string
  bodyType?: string | null
  registeredOwner: string
  dvlaOffice?: string | null
  registrationDate: string
  expiryDate: string
  status: string
  truck: { id: string; plateNumber: string; make: string; model: string }
  lastRenewalDate?: string | null
  notes?: string | null
}

// ─── Props ────────────────────────────────────────────────────────────────
interface DvlaFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  registration?: DvlaRegistration | null
  onSuccess: () => void
}

// ─── Constants ────────────────────────────────────────────────────────────
const VEHICLE_CLASS_OPTIONS = [
  { value: 'heavy_goods', label: 'Heavy Goods' },
  { value: 'medium_goods', label: 'Medium Goods' },
  { value: 'light_goods', label: 'Light Goods' },
  { value: 'articulated', label: 'Articulated' },
  { value: 'trailer', label: 'Trailer' },
]

const BODY_TYPE_OPTIONS = [
  { value: 'flatbed', label: 'Flatbed' },
  { value: 'tanker', label: 'Tanker' },
  { value: 'tipper', label: 'Tipper' },
  { value: 'container', label: 'Container' },
  { value: 'tanker_trailer', label: 'Tanker Trailer' },
  { value: 'drop_side', label: 'Drop Side' },
  { value: 'low_bed', label: 'Low Bed' },
  { value: 'refrigerated', label: 'Refrigerated' },
  { value: 'other', label: 'Other' },
]

const DVLA_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'transferred', label: 'Transferred' },
  { value: 'revoked', label: 'Revoked' },
]

interface TruckOption {
  id: string
  plateNumber: string
  make: string
  model: string
}

// ─── Component ────────────────────────────────────────────────────────────
export function DvlaFormDialog({ open, onOpenChange, registration, onSuccess }: DvlaFormDialogProps) {
  const isEditing = !!registration
  const [submitting, setSubmitting] = useState(false)
  const [trucks, setTrucks] = useState<TruckOption[]>([])
  const [loadingTrucks, setLoadingTrucks] = useState(false)

  // Form fields
  const [truckId, setTruckId] = useState('')
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [certificateNumber, setCertificateNumber] = useState('')
  const [vehicleClass, setVehicleClass] = useState('')
  const [bodyType, setBodyType] = useState('')
  const [axleConfig, setAxleConfig] = useState('')
  const [engineCapacity, setEngineCapacity] = useState('')
  const [grossVehicleWeight, setGrossVehicleWeight] = useState('')
  const [unladenWeight, setUnladenWeight] = useState('')
  const [yearOfManufacture, setYearOfManufacture] = useState('')
  const [countryOfOrigin, setCountryOfOrigin] = useState('')
  const [registeredOwner, setRegisteredOwner] = useState('')
  const [ownerAddress, setOwnerAddress] = useState('')
  const [ownerContact, setOwnerContact] = useState('')
  const [dvlaOffice, setDvlaOffice] = useState('')
  const [registrationFee, setRegistrationFee] = useState('')
  const [registrationDate, setRegistrationDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [status, setStatus] = useState('active')
  const [notes, setNotes] = useState('')

  // ─── Load trucks ──────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setLoadingTrucks(true)
      apiFetch<{ data: TruckOption[] }>('/api/trucks?limit=100&status=active')
        .then((res) => setTrucks(res.data || []))
        .catch(() => toast.error('Failed to load trucks'))
        .finally(() => setLoadingTrucks(false))
    }
  }, [open])

  // ─── Pre-fill form when editing ───────────────────────────────────────
  useEffect(() => {
    if (registration && open) {
      setTruckId(registration.truckId)
      setRegistrationNumber(registration.registrationNumber)
      setCertificateNumber(registration.certificateNumber)
      setVehicleClass(registration.vehicleClass)
      setBodyType(registration.bodyType || '')
      setRegisteredOwner(registration.registeredOwner)
      setDvlaOffice(registration.dvlaOffice || '')
      setRegistrationDate(registration.registrationDate ? new Date(registration.registrationDate).toISOString().split('T')[0] : '')
      setExpiryDate(registration.expiryDate ? new Date(registration.expiryDate).toISOString().split('T')[0] : '')
      setStatus(registration.status || 'active')
      setNotes(registration.notes || '')
      // Reset optional fields not in the interface
      setAxleConfig('')
      setEngineCapacity('')
      setGrossVehicleWeight('')
      setUnladenWeight('')
      setYearOfManufacture('')
      setCountryOfOrigin('')
      setOwnerAddress('')
      setOwnerContact('')
      setRegistrationFee('')
    } else if (!registration && open) {
      resetForm()
    }
  }, [registration, open])

  function resetForm() {
    setTruckId('')
    setRegistrationNumber('')
    setCertificateNumber('')
    setVehicleClass('')
    setBodyType('')
    setAxleConfig('')
    setEngineCapacity('')
    setGrossVehicleWeight('')
    setUnladenWeight('')
    setYearOfManufacture('')
    setCountryOfOrigin('')
    setRegisteredOwner('')
    setOwnerAddress('')
    setOwnerContact('')
    setDvlaOffice('')
    setRegistrationFee('')
    setRegistrationDate('')
    setExpiryDate('')
    setStatus('active')
    setNotes('')
  }

  const truckOptions: SearchableOption[] = [
    ...(trucks || []).map((t): SearchableOption => ({
      value: t.id,
      label: `${t.plateNumber} — ${t.make} ${t.model}`,
    })),
  ]

  // ─── Submit handler ───────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!truckId) { toast.error('Please select a truck'); return }
    if (!registrationNumber.trim()) { toast.error('Registration number is required'); return }
    if (!certificateNumber.trim()) { toast.error('Certificate number is required'); return }
    if (!vehicleClass) { toast.error('Vehicle class is required'); return }
    if (!registeredOwner.trim()) { toast.error('Registered owner is required'); return }
    if (!registrationDate) { toast.error('Registration date is required'); return }
    if (!expiryDate) { toast.error('Expiry date is required'); return }

    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        truckId,
        registrationNumber: registrationNumber.trim(),
        certificateNumber: certificateNumber.trim(),
        vehicleClass,
        registeredOwner: registeredOwner.trim(),
        registrationDate,
        expiryDate,
      }

      // Optional fields
      if (bodyType) body.bodyType = bodyType
      if (axleConfig.trim()) body.axleConfiguration = axleConfig.trim()
      if (engineCapacity.trim()) body.engineCapacity = engineCapacity.trim()
      if (grossVehicleWeight) body.grossVehicleWeight = parseFloat(grossVehicleWeight)
      if (unladenWeight) body.unladenWeight = parseFloat(unladenWeight)
      if (yearOfManufacture) body.yearOfManufacture = parseInt(yearOfManufacture, 10)
      if (countryOfOrigin.trim()) body.countryOfOrigin = countryOfOrigin.trim()
      if (ownerAddress.trim()) body.ownerAddress = ownerAddress.trim()
      if (ownerContact.trim()) body.ownerContact = ownerContact.trim()
      if (dvlaOffice.trim()) body.dvlaOffice = dvlaOffice.trim()
      if (registrationFee) body.registrationFee = parseFloat(registrationFee)
      if (isEditing) body.status = status
      if (notes.trim()) body.notes = notes.trim()

      const url = isEditing ? `/api/dvla-registrations/${registration!.id}` : '/api/dvla-registrations'
      const method = isEditing ? 'PUT' : 'POST'

      const res = await apiFetch<{ success: boolean }>(url, {
        method,
        body: JSON.stringify(body),
      })

      if (!res) throw new Error('Operation failed')

      toast.success(isEditing ? 'DVLA registration updated successfully' : 'DVLA registration added successfully')
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save DVLA registration')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5 text-primary" />
            {isEditing ? 'Edit DVLA Registration' : 'Add New DVLA Registration'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? `Update registration details for ${registration?.registrationNumber}`
              : 'Enter the details for a new DVLA vehicle registration'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Truck Selection */}
            <div className="space-y-2">
              <Label>
                Truck <span className="text-destructive">*</span>
              </Label>
              <SearchableSelect
                placeholder={loadingTrucks ? 'Loading trucks...' : 'Select a truck'}
                searchPlaceholder="Search trucks..."
                emptyMessage="No trucks found"
                value={truckId}
                onValueChange={setTruckId}
                options={truckOptions}
                disabled={loadingTrucks || isEditing}
              />
            </div>

            {/* Registration Number + Certificate Number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reg-number">
                  Registration Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="reg-number"
                  placeholder="e.g., AW 1234-25"
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cert-number">
                  Certificate Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="cert-number"
                  placeholder="e.g., DVLA-2024-001"
                  value={certificateNumber}
                  onChange={(e) => setCertificateNumber(e.target.value)}
                />
              </div>
            </div>

            {/* Vehicle Class + Body Type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Vehicle Class <span className="text-destructive">*</span>
                </Label>
                <Select value={vehicleClass} onValueChange={setVehicleClass}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select vehicle class" />
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_CLASS_OPTIONS.map((cls) => (
                      <SelectItem key={cls.value} value={cls.value}>
                        {cls.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Body Type</Label>
                <Select value={bodyType} onValueChange={setBodyType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select body type" />
                  </SelectTrigger>
                  <SelectContent>
                    {BODY_TYPE_OPTIONS.map((bt) => (
                      <SelectItem key={bt.value} value={bt.value}>
                        {bt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Axle Configuration + Engine Capacity */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="axle-config">Axle Configuration</Label>
                <Input
                  id="axle-config"
                  placeholder="e.g., 6x4"
                  value={axleConfig}
                  onChange={(e) => setAxleConfig(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="engine-cap">Engine Capacity (cc)</Label>
                <Input
                  id="engine-cap"
                  type="text"
                  placeholder="e.g., 12000"
                  value={engineCapacity}
                  onChange={(e) => setEngineCapacity(e.target.value)}
                />
              </div>
            </div>

            {/* Gross Vehicle Weight + Unladen Weight */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gvw">Gross Vehicle Weight (kg)</Label>
                <Input
                  id="gvw"
                  type="number"
                  step="1"
                  min="0"
                  placeholder="e.g., 28000"
                  value={grossVehicleWeight}
                  onChange={(e) => setGrossVehicleWeight(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unladen">Unladen Weight (kg)</Label>
                <Input
                  id="unladen"
                  type="number"
                  step="1"
                  min="0"
                  placeholder="e.g., 12000"
                  value={unladenWeight}
                  onChange={(e) => setUnladenWeight(e.target.value)}
                />
              </div>
            </div>

            {/* Year of Manufacture + Country of Origin */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="yom">Year of Manufacture</Label>
                <Input
                  id="yom"
                  type="number"
                  min="1950"
                  max={new Date().getFullYear()}
                  placeholder={String(new Date().getFullYear())}
                  value={yearOfManufacture}
                  onChange={(e) => setYearOfManufacture(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country of Origin</Label>
                <Input
                  id="country"
                  placeholder="e.g., Japan"
                  value={countryOfOrigin}
                  onChange={(e) => setCountryOfOrigin(e.target.value)}
                />
              </div>
            </div>

            {/* Registered Owner (full width) */}
            <div className="space-y-2">
              <Label htmlFor="owner">
                Registered Owner <span className="text-destructive">*</span>
              </Label>
              <Input
                id="owner"
                placeholder={`e.g., ${APP_COMPANY}`}
                value={registeredOwner}
                onChange={(e) => setRegisteredOwner(e.target.value)}
              />
            </div>

            {/* Owner Address + Owner Contact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="owner-addr">Owner Address</Label>
                <Input
                  id="owner-addr"
                  placeholder="e.g., Industrial Area, Accra"
                  value={ownerAddress}
                  onChange={(e) => setOwnerAddress(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="owner-contact">Owner Contact</Label>
                <Input
                  id="owner-contact"
                  placeholder="e.g., +233 24 000 0000"
                  value={ownerContact}
                  onChange={(e) => setOwnerContact(e.target.value)}
                />
              </div>
            </div>

            {/* DVLA Office + Registration Fee */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dvla-office">DVLA Office</Label>
                <Input
                  id="dvla-office"
                  placeholder="e.g., DVLA Head Office, Accra"
                  value={dvlaOffice}
                  onChange={(e) => setDvlaOffice(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-fee">Registration Fee (\u20B5)</Label>
                <Input
                  id="reg-fee"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={registrationFee}
                  onChange={(e) => setRegistrationFee(e.target.value)}
                />
              </div>
            </div>

            {/* Registration Date + Expiry Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reg-date">
                  Registration Date <span className="text-destructive">*</span>
                </Label>
                <DatePicker value={registrationDate} onChange={(val) => setRegistrationDate(val)} id="reg-date" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exp-date">
                  Expiry Date <span className="text-destructive">*</span>
                </Label>
                <DatePicker value={expiryDate} onChange={(val) => setExpiryDate(val)} id="exp-date" />
              </div>
            </div>

            {/* Status (edit mode only) */}
            {isEditing && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DVLA_STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Notes (full width) */}
            <div className="space-y-2">
              <Label htmlFor="dvla-notes">Notes</Label>
              <Textarea
                id="dvla-notes"
                placeholder="Any additional notes about this registration..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : isEditing ? (
                'Update Registration'
              ) : (
                'Add Registration'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
