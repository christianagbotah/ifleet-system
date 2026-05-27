'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, ImagePlus, BadgeInfo, UserPlus, MonitorSmartphone, CheckCircle2 } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { createDriver, type Driver } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'
import { toast } from 'sonner'

const LICENSE_CLASSES = ['A', 'B', 'C', 'D', 'E'] as const

const driverFormSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phone: z
    .string()
    .min(1, 'Phone number is required')
    .regex(/^\+233/, 'Phone must start with +233'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  dateOfBirth: z.string().optional().or(z.literal('')),
  ghanaCardNumber: z.string().optional().or(z.literal('')),
  ghanaCardExpiry: z.string().optional().or(z.literal('')),
  licenseNumber: z.string().min(1, 'License number is required'),
  licenseClass: z.string().min(1, 'License class is required'),
  licenseExpiry: z.string().min(1, 'License expiry date is required'),
  address: z.string().optional().or(z.literal('')),
  emergencyName: z.string().optional().or(z.literal('')),
  emergencyPhone: z.string().optional().or(z.literal('')),
  photo: z.string().optional().or(z.literal('')),
  licenseImage: z.string().optional().or(z.literal('')),
  ghanaCardFrontImage: z.string().optional().or(z.literal('')),
  ghanaCardBackImage: z.string().optional().or(z.literal('')),
})

type DriverFormValues = z.infer<typeof driverFormSchema>

function ImageUploadField({
  label,
  value,
  onChange,
  onUpload,
  uploading,
}: {
  label: string
  value?: string | null
  onChange: (url: string | null) => void
  onUpload: (file: File) => void
  uploading: boolean
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  function handleTriggerUpload() {
    if (!uploading) fileInputRef.current?.click()
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex items-center gap-3">
        <label
          className={`relative cursor-pointer group ${
            value ? '' : 'h-20 w-32 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20 flex items-center justify-center text-muted-foreground hover:text-amber-500 transition-colors'
          }`}
          onClick={handleTriggerUpload}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onUpload(file)
              e.target.value = ''
            }}
            disabled={uploading}
          />
          {value ? (
            <>
              <img
                src={value}
                alt={label}
                className="h-20 w-32 rounded-lg object-cover border"
              />
              {uploading && (
                <div className="absolute inset-0 rounded-lg bg-black/50 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 text-white animate-spin" />
                </div>
              )}
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onChange(null)
                }}
              >
                ✕
              </Button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1">
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
              ) : (
                <ImagePlus className="h-6 w-6" />
              )}
              <span className="text-[10px] font-medium">
                {uploading ? 'Uploading...' : 'Click to upload'}
              </span>
            </div>
          )}
        </label>
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={handleTriggerUpload}
          >
            {uploading ? 'Uploading...' : 'Browse'}
          </Button>
          <p className="text-xs text-muted-foreground mt-1">JPG, PNG max 5MB</p>
        </div>
      </div>
    </div>
  )
}

interface DriverFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  driver?: Driver | null
  onCreated?: () => void
  onUpdated?: () => void
}

export function DriverFormDialog({
  open,
  onOpenChange,
  driver,
  onCreated,
  onUpdated,
}: DriverFormDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [nextDriverId, setNextDriverId] = React.useState<string | null>(null)
  const [createAccount, setCreateAccount] = React.useState(false)
  const [accountEmail, setAccountEmail] = React.useState('')
  const [accountPassword, setAccountPassword] = React.useState('')
  const isEditing = !!driver

  const form = useForm<DriverFormValues>({
    resolver: zodResolver(driverFormSchema),
    defaultValues: {
      employeeId: '',
      firstName: '',
      lastName: '',
      phone: '+233 ',
      email: '',
      dateOfBirth: '',
      ghanaCardNumber: '',
      ghanaCardExpiry: '',
      licenseNumber: '',
      licenseClass: '',
      licenseExpiry: '',
      address: '',
      emergencyName: '',
      emergencyPhone: '',
      photo: '',
      licenseImage: '',
      ghanaCardFrontImage: '',
      ghanaCardBackImage: '',
    },
  })

  // Fetch the next auto-generated driver ID when creating a new driver
  React.useEffect(() => {
    if (!open || driver) {
      setNextDriverId(null)
      setCreateAccount(false)
      setAccountEmail('')
      setAccountPassword('')
      return
    }
    setCreateAccount(false)
    setAccountEmail('')
    setAccountPassword('')
    const token = useAuthStore.getState().token
    if (!token) return
    fetch('/api/drivers/next-id?preview=true', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.nextId) {
          setNextDriverId(data.nextId)
          form.setValue('employeeId', data.nextId)
        }
      })
      .catch(() => {})
  }, [open, driver, form])

  React.useEffect(() => {
    if (open) {
      if (driver) {
        form.reset({
          employeeId: (driver as Record<string, unknown>).employeeId as string || '',
          firstName: driver.firstName,
          lastName: driver.lastName,
          phone: driver.phone,
          email: driver.email || '',
          dateOfBirth: driver.dateOfBirth
            ? driver.dateOfBirth.split('T')[0]
            : '',
          ghanaCardNumber: (driver as Record<string, unknown>).ghanaCardNumber as string || '',
          ghanaCardExpiry: (driver as Record<string, unknown>).ghanaCardExpiry
            ? String((driver as Record<string, unknown>).ghanaCardExpiry).split('T')[0]
            : '',
          licenseNumber: driver.licenseNumber,
          licenseClass: driver.licenseClass,
          licenseExpiry: driver.licenseExpiry
            ? driver.licenseExpiry.split('T')[0]
            : '',
          address: driver.address || '',
          emergencyName: (driver as Record<string, unknown>).emergencyName as string || '',
          emergencyPhone: (driver as Record<string, unknown>).emergencyPhone as string || '',
          photo: (driver as Record<string, unknown>).photo as string || '',
          licenseImage: (driver as Record<string, unknown>).licenseImage as string || '',
          ghanaCardFrontImage: (driver as Record<string, unknown>).ghanaCardFrontImage as string || '',
          ghanaCardBackImage: (driver as Record<string, unknown>).ghanaCardBackImage as string || '',
        })
      } else {
        form.reset({
          employeeId: nextDriverId || '',
          firstName: '',
          lastName: '',
          phone: '+233 ',
          email: '',
          dateOfBirth: '',
          ghanaCardNumber: '',
          ghanaCardExpiry: '',
          licenseNumber: '',
          licenseClass: '',
          licenseExpiry: '',
          address: '',
          emergencyName: '',
          emergencyPhone: '',
          photo: '',
          licenseImage: '',
          ghanaCardFrontImage: '',
          ghanaCardBackImage: '',
        })
      }
    }
  }, [driver, form, open])

  async function handleImageUpload(file: File, field: string) {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Upload failed')
      const { url } = await res.json()
      form.setValue(field, url, { shouldValidate: false })
      toast.success('Image uploaded')
    } catch {
      toast.error('Failed to upload image')
    } finally {
      setUploading(false)
    }
  }

  async function onSubmit(data: DriverFormValues) {
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        licenseNumber: data.licenseNumber,
        licenseClass: data.licenseClass,
        licenseExpiry: data.licenseExpiry,
      }

      // When creating, let the backend auto-generate the employee ID
      // (the backend increments the counter and generates from system settings)
      if (driver && data.employeeId) {
        body.employeeId = data.employeeId
      }

      // Only include optional fields if they have values
      if (data.email) body.email = data.email
      if (data.dateOfBirth) body.dateOfBirth = data.dateOfBirth
      if (data.ghanaCardNumber) body.ghanaCardNumber = data.ghanaCardNumber
      if (data.ghanaCardExpiry) body.ghanaCardExpiry = data.ghanaCardExpiry
      if (data.address) body.address = data.address
      if (data.emergencyName) body.emergencyName = data.emergencyName
      if (data.emergencyPhone) body.emergencyPhone = data.emergencyPhone

      // Include image fields if they have values
      if (form.getValues('photo')) body.photo = form.getValues('photo')
      if (form.getValues('licenseImage')) body.licenseImage = form.getValues('licenseImage')
      if (form.getValues('ghanaCardFrontImage')) body.ghanaCardFrontImage = form.getValues('ghanaCardFrontImage')
      if (form.getValues('ghanaCardBackImage')) body.ghanaCardBackImage = form.getValues('ghanaCardBackImage')

      // Include login account creation for new drivers
      if (!driver && createAccount) {
        body.createAccount = true
        body.accountEmail = accountEmail
        body.accountPassword = accountPassword
      }

      if (driver) {
        const res = await fetch(`/api/drivers/${driver.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Update failed' }))
          throw new Error(err.error || 'Failed to update driver')
        }
        toast.success('Driver updated successfully', {
          description: `${data.firstName} ${data.lastName}`,
        })
        onUpdated?.()
      } else {
        const created = await createDriver(body)
        toast.success(createAccount ? 'Driver & login account created' : 'Driver added successfully', {
          description: `${data.firstName} ${data.lastName} (${created.employeeId || data.employeeId})${createAccount ? ' — can now sign in' : ''}`,
        })
        onCreated?.()
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{driver ? 'Edit Driver' : 'Add New Driver'}</DialogTitle>
          <DialogDescription>
            {driver
              ? 'Update driver information below.'
              : 'Register a new driver to the fleet.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
        <Form {...form}>
          <form id="driver-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Section 1: Employee Information */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                Employee Information
              </h3>
              <FormField
                control={form.control}
                name="employeeId"
                render={({ field }) => (
                  <FormItem className="sm:max-w-xs">
                    <FormLabel>Employee ID *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          placeholder="FP-DRV-001"
                          readOnly={!isEditing}
                          className={!isEditing ? 'bg-muted cursor-not-allowed pr-20' : ''}
                          {...field}
                        />
                        {!isEditing && nextDriverId && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <BadgeInfo className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground font-medium">Auto</span>
                          </div>
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* Section 2: Personal Information */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                Personal Information
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Kwame" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Asante" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone *</FormLabel>
                      <FormControl>
                        <Input placeholder="+233 24 567 8901" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="driver@example.com (optional)"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="dateOfBirth"
                render={({ field }) => (
                  <FormItem className="sm:max-w-xs">
                    <FormLabel>Date of Birth</FormLabel>
                    <FormControl>
                      <DatePicker value={field.value} onChange={(val) => field.onChange(val)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* Section 3: Ghana Card (National ID) */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                Ghana Card (National ID)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="ghanaCardNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Card Number</FormLabel>
                      <FormControl>
                        <Input placeholder="GHA-XXXXXXXXX-X" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="ghanaCardExpiry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Card Expiry</FormLabel>
                      <FormControl>
                        <DatePicker value={field.value} onChange={(val) => field.onChange(val)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ImageUploadField
                  label="Ghana Card Front Image"
                  value={form.watch('ghanaCardFrontImage') || null}
                  onChange={(url) => form.setValue('ghanaCardFrontImage', url ?? '', { shouldValidate: false })}
                  onUpload={(file) => handleImageUpload(file, 'ghanaCardFrontImage')}
                  uploading={uploading}
                />
                <ImageUploadField
                  label="Ghana Card Back Image"
                  value={form.watch('ghanaCardBackImage') || null}
                  onChange={(url) => form.setValue('ghanaCardBackImage', url ?? '', { shouldValidate: false })}
                  onUpload={(file) => handleImageUpload(file, 'ghanaCardBackImage')}
                  uploading={uploading}
                />
              </div>
            </div>

            <Separator />

            {/* Section 4: License Information */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                License Information
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="licenseNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>License Number *</FormLabel>
                      <FormControl>
                        <Input placeholder="DL-A-4521" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="licenseClass"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>License Class *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select class" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {LICENSE_CLASSES.map((cls) => (
                            <SelectItem key={cls} value={cls}>
                              Class {cls}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="licenseExpiry"
                render={({ field }) => (
                  <FormItem className="sm:max-w-xs">
                    <FormLabel>License Expiry *</FormLabel>
                    <FormControl>
                      <DatePicker value={field.value} onChange={(val) => field.onChange(val)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <ImageUploadField
                label="License Image"
                value={form.watch('licenseImage') || null}
                onChange={(url) => form.setValue('licenseImage', url ?? '', { shouldValidate: false })}
                onUpload={(file) => handleImageUpload(file, 'licenseImage')}
                uploading={uploading}
              />
            </div>

            <Separator />

            {/* Section 5: Driver Photo */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                Driver Photo
              </h3>
              <ImageUploadField
                label="Photo"
                value={form.watch('photo') || null}
                onChange={(url) => form.setValue('photo', url ?? '', { shouldValidate: false })}
                onUpload={(file) => handleImageUpload(file, 'photo')}
                uploading={uploading}
              />
            </div>

            <Separator />

            {/* Section 6: Additional Details */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                Additional Details
              </h3>
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input placeholder="Home address (optional)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="emergencyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Emergency Contact Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Contact name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="emergencyPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Emergency Contact Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="+233 xx xxx xxxx" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Section 7: Login Account (only when creating new driver) */}
            {!isEditing && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                        Login Account
                      </h3>
                      {createAccount && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded-full font-medium">
                          Will be created
                        </span>
                      )}
                    </div>
                    <Switch
                      checked={createAccount}
                      onCheckedChange={setCreateAccount}
                      disabled={submitting}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Enable this to create a login account so the driver can sign into the app with their email and password.
                  </p>
                  {createAccount && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 rounded-lg bg-muted/50 border space-y-0">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium flex items-center gap-1.5">
                          <MonitorSmartphone className="h-3.5 w-3.5 text-muted-foreground" />
                          Account Email <span className="text-destructive">*</span>
                        </label>
                        <Input
                          type="email"
                          placeholder="driver@company.com"
                          value={accountEmail}
                          onChange={(e) => setAccountEmail(e.target.value)}
                          disabled={submitting}
                        />
                        <p className="text-[10px] text-muted-foreground">Used to sign into the app</p>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                          Password <span className="text-destructive">*</span>
                        </label>
                        <Input
                          type="password"
                          placeholder="Minimum 4 characters"
                          value={accountPassword}
                          onChange={(e) => setAccountPassword(e.target.value)}
                          disabled={submitting}
                        />
                        <p className="text-[10px] text-muted-foreground">The driver will change this after first login</p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

          </form>
        </Form>
        </DialogBody>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="driver-form"
            className="bg-amber-500 hover:bg-amber-600 text-white"
            disabled={submitting}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting
              ? 'Saving...'
              : driver
                ? 'Update Driver'
                : 'Add Driver'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
