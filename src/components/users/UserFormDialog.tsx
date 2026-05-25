'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Briefcase, Hash, Monitor, UserRound } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { SearchableSelect, type SearchableOption } from '@/components/ui/searchable-select'
import { toast } from 'sonner'

// ---- Types ----

interface UserItem {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  roleId: string
  role?: { id: string; name: string } | null
  position?: string | null
  department?: string | null
  employeeNumber?: string | null
  isActive: boolean
  driverId?: string | null
  driver?: { id: string; firstName: string; lastName: string } | null
}

interface RoleItem {
  id: string
  name: string
  description?: string | null
  userCount: number
  permissions: string[]
  isSystem?: boolean
}

interface DriverOption {
  id: string
  firstName: string
  lastName: string
  phone?: string | null
}

interface UserFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user?: UserItem | null
  roles: RoleItem[]
  onSaved: () => void
}

// ---- Constants ----

const DEPARTMENTS = [
  'Operations',
  'Maintenance',
  'Finance',
  'HR',
  'Warehouse',
  'Management',
]

const departmentOptions: SearchableOption[] = [
  { value: '', label: 'No Department' },
  ...DEPARTMENTS.map((d) => ({ value: d, label: d })),
]

// ---- Schemas ----

// For system users (hasSystemAccess = true)
const systemUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  phone: z.string().optional().or(z.literal('')),
  password: z.string().min(4, 'Password must be at least 4 characters'),
  roleId: z.string().min(1, 'Role is required'),
  driverId: z.string().optional(),
  isActive: z.boolean(),
  position: z.string().optional().or(z.literal('')),
  department: z.string().optional().or(z.literal('')),
  employeeNumber: z.string().optional().or(z.literal('')),
  hasSystemAccess: z.literal(true),
})

// For staff-only (hasSystemAccess = false)
const staffOnlySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  password: z.string().optional().or(z.literal('')),
  roleId: z.string().min(1, 'Role is required'),
  driverId: z.string().optional(),
  isActive: z.boolean(),
  position: z.string().optional().or(z.literal('')),
  department: z.string().optional().or(z.literal('')),
  employeeNumber: z.string().optional().or(z.literal('')),
  hasSystemAccess: z.literal(false),
})

// Edit schema (email/password optional when editing — can be changed via toggle)
const editUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  password: z.string().optional().or(z.literal('')),
  roleId: z.string().min(1, 'Role is required'),
  driverId: z.string().optional(),
  isActive: z.boolean(),
  position: z.string().optional().or(z.literal('')),
  department: z.string().optional().or(z.literal('')),
  employeeNumber: z.string().optional().or(z.literal('')),
  hasSystemAccess: z.boolean(),
})

type FormValues = z.infer<typeof systemUserSchema> & z.infer<typeof staffOnlySchema> & z.infer<typeof editUserSchema>

// ---- Component ----

export function UserFormDialog({ open, onOpenChange, user, roles, onSaved }: UserFormDialogProps) {
  const isEditing = !!user
  // A user is considered a "system user" if they have an email
  const isExistingSystemUser = !!user?.email
  const [submitting, setSubmitting] = React.useState(false)
  const [drivers, setDrivers] = React.useState<DriverOption[]>([])
  const [driversLoading, setDriversLoading] = React.useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      password: '',
      roleId: '',
      driverId: '',
      isActive: true,
      position: '',
      department: '',
      employeeNumber: '',
      hasSystemAccess: false,
    },
  })

  // Watch hasSystemAccess for conditional rendering
  const hasSystemAccess = form.watch('hasSystemAccess')

  // Reset form when dialog opens or user changes
  React.useEffect(() => {
    if (open) {
      if (user) {
        form.reset({
          name: user.name,
          email: user.email || '',
          phone: user.phone || '',
          password: '',
          roleId: user.roleId,
          driverId: user.driverId || '',
          isActive: user.isActive,
          position: user.position || '',
          department: user.department || '',
          employeeNumber: user.employeeNumber || '',
          hasSystemAccess: !!user.email,
        })
      } else {
        form.reset({
          name: '',
          email: '',
          phone: '',
          password: '',
          roleId: '',
          driverId: '',
          isActive: true,
          position: '',
          department: '',
          employeeNumber: '',
          hasSystemAccess: false,
        })
      }
    }
  }, [user, form, open])

  // Dynamically switch resolver based on hasSystemAccess
  React.useEffect(() => {
    if (!open) return
    if (isEditing) {
      form.changeResolver(zodResolver(editUserSchema))
    } else if (hasSystemAccess) {
      form.changeResolver(zodResolver(systemUserSchema))
    } else {
      form.changeResolver(zodResolver(staffOnlySchema))
    }
  }, [hasSystemAccess, isEditing, form, open])

  // Fetch drivers when dialog opens
  React.useEffect(() => {
    if (!open) return
    let cancelled = false

    async function loadDrivers() {
      setDriversLoading(true)
      try {
        const res = await fetch('/api/drivers?limit=100')
        if (!res.ok) throw new Error('Failed to fetch drivers')
        const data = await res.json()
        if (!cancelled) {
          setDrivers(Array.isArray(data) ? data : data.data || [])
        }
      } catch {
        // Silently fail — driver selection is optional
        if (!cancelled) setDrivers([])
      } finally {
        if (!cancelled) setDriversLoading(false)
      }
    }

    loadDrivers()
    return () => { cancelled = true }
  }, [open])

  // Build role options
  const roleOptions: SearchableOption[] = React.useMemo(
    () =>
      roles.map((r) => ({
        value: r.id,
        label: r.name,
        description: `${r.userCount} user${r.userCount !== 1 ? 's' : ''}`,
      })),
    [roles]
  )

  // Build driver options with "None" as default
  const driverOptions: SearchableOption[] = React.useMemo(() => {
    const opts: SearchableOption[] = [
      { value: '', label: 'None (unlinked)', description: 'No driver linked' },
    ]
    drivers.forEach((d) => {
      opts.push({
        value: d.id,
        label: `${d.firstName} ${d.lastName}`,
        description: d.phone || undefined,
      })
    })
    return opts
  }, [drivers, user?.driverId])

  // Quick role templates for staff
  const staffRoleTemplates = React.useMemo(() => {
    return roles.filter((r) =>
      ['Dispatcher', 'Mechanic', 'Accountant', 'Warehouse Manager', 'HR', 'Operations Manager'].includes(r.name)
    )
  }, [roles])

  function handleRoleTemplateClick(role: RoleItem) {
    form.setValue('roleId', role.id, { shouldValidate: true })
    // Auto-set department based on role
    const deptMap: Record<string, string> = {
      Dispatcher: 'Operations',
      Mechanic: 'Maintenance',
      Accountant: 'Finance',
      'Warehouse Manager': 'Warehouse',
      HR: 'HR',
      'Operations Manager': 'Management',
    }
    const dept = deptMap[role.name]
    if (dept) {
      form.setValue('department', dept)
    }
    // Auto-set position hint
    const posMap: Record<string, string> = {
      Dispatcher: 'Dispatcher',
      Mechanic: 'Mechanic',
      Accountant: 'Accountant',
      'Warehouse Manager': 'Warehouse Manager',
      HR: 'HR Officer',
      'Operations Manager': 'Operations Manager',
    }
    const pos = posMap[role.name]
    if (pos && !form.getValues('position')) {
      form.setValue('position', pos)
    }
    toast.success(`Applied ${role.name} template`, {
      description: 'Role, department, and position pre-filled.',
    })
  }

  async function onSubmit(data: FormValues) {
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        name: data.name,
        email: data.hasSystemAccess ? data.email : null,
        phone: data.phone || null,
        roleId: data.roleId,
        isActive: data.isActive,
        driverId: data.driverId || null,
        position: data.position || null,
        department: data.department || null,
        employeeNumber: data.employeeNumber || null,
        hasSystemAccess: data.hasSystemAccess,
      }

      if (!isEditing && data.hasSystemAccess) {
        body.password = data.password
      }

      // When editing and granting system access (was staff-only, now system user)
      if (isEditing && data.hasSystemAccess && !isExistingSystemUser) {
        if (!data.email || !data.password) {
          toast.error('Email and password are required to grant system access')
          setSubmitting(false)
          return
        }
        body.email = data.email
        body.password = data.password
      }

      // When editing and revoking system access
      if (isEditing && !data.hasSystemAccess && isExistingSystemUser) {
        body.email = null
        body.password = null
      }

      if (isEditing && user) {
        const res = await fetch(`/api/users/${user.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Failed to update staff')
        }
        toast.success('Staff updated successfully', {
          description: `${data.name} has been updated.`,
        })
      } else {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Failed to create staff')
        }
        toast.success(
          data.hasSystemAccess ? 'User created successfully' : 'Staff added successfully',
          {
            description: data.hasSystemAccess
              ? `${data.name} has been added with system access.`
              : `${data.name} has been added as staff.`,
          }
        )
      }

      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedRoleId = form.watch('roleId')
  const selectedRole = roles.find((r) => r.id === selectedRoleId)

  // Determine if current role is a driver role
  const isDriverRole = selectedRole?.name === 'Driver'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Staff Member' : 'Add Staff Member'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update staff information and system access settings.'
              : 'Fill in the details to add a new staff member to the system.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex-1 min-h-0">
        <form id="user-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Name & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="Full name"
                {...form.register('name')}
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                placeholder="+233 XX XXX XXXX"
                {...form.register('phone')}
              />
            </div>
          </div>

          {/* Role */}
          <div className="space-y-2">
            <Label>
              Role <span className="text-destructive">*</span>
            </Label>
            <SearchableSelect
              options={roleOptions}
              value={form.watch('roleId')}
              onValueChange={(val) => form.setValue('roleId', val, { shouldValidate: true })}
              placeholder="Select a role"
              searchPlaceholder="Search roles..."
              emptyMessage="No roles found"
              disabled={submitting}
            />
            {form.formState.errors.roleId && (
              <p className="text-xs text-destructive">{form.formState.errors.roleId.message}</p>
            )}
          </div>

          {/* System Access Toggle */}
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-muted-foreground" />
                System Access
              </Label>
              <p className="text-xs text-muted-foreground">
                {hasSystemAccess
                  ? 'This staff member can log in with email and password.'
                  : 'Staff-only record — no login credentials needed.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={
                  hasSystemAccess
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[11px]'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 text-[11px]'
                }
              >
                {hasSystemAccess ? 'Can Login' : 'No Login'}
              </Badge>
              <Switch
                checked={hasSystemAccess}
                onCheckedChange={(checked) => form.setValue('hasSystemAccess', checked)}
                disabled={submitting}
              />
            </div>
          </div>

          {/* Login Credentials — only shown when System Access is ON */}
          {hasSystemAccess && (
            <>
              <div className="space-y-2">
                <Label htmlFor="email">
                  Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@company.com"
                  {...form.register('email')}
                />
                {form.formState.errors.email && (
                  <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
                )}
              </div>

              {!isEditing || (isEditing && !isExistingSystemUser) ? (
                <div className="space-y-2">
                  <Label htmlFor="password">
                    Password <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder={isEditing ? 'Set a new password' : 'Minimum 4 characters'}
                    {...form.register('password')}
                  />
                  {form.formState.errors.password && (
                    <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                  💡 To change the password for this user, use the account settings or reset feature.
                </p>
              )}
            </>
          )}

          <Separator />

          {/* ---- Staff Details Section ---- */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-semibold">Staff Details</h3>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                Optional
              </Badge>
            </div>

            {/* Position & Department */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="position">Position / Title</Label>
                <Input
                  id="position"
                  placeholder="e.g. Head Mechanic, Lead Dispatcher"
                  {...form.register('position')}
                />
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <SearchableSelect
                  options={departmentOptions}
                  value={form.watch('department')}
                  onValueChange={(val) => form.setValue('department', val)}
                  placeholder="Select department"
                  emptyMessage="No departments"
                  disabled={submitting}
                />
              </div>
            </div>

            {/* Employee Number */}
            <div className="space-y-2">
              <Label htmlFor="employeeNumber" className="flex items-center gap-1.5">
                <Hash className="h-3.5 w-3.5" />
                Employee Number
              </Label>
              <Input
                id="employeeNumber"
                placeholder="e.g. EMP-OPS-001"
                {...form.register('employeeNumber')}
              />
              <p className="text-xs text-muted-foreground">
                Unique employee identifier. Leave blank to auto-generate later.
              </p>
            </div>
          </div>

          {/* Quick Role Templates — only for new staff, when system access is OFF */}
          {!isEditing && !hasSystemAccess && staffRoleTemplates.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Quick Role Templates</h3>
                <p className="text-xs text-muted-foreground">
                  Click a template to auto-fill role, department, and position for common staff types.
                </p>
                <div className="flex flex-wrap gap-2">
                  {staffRoleTemplates.map((role) => (
                    <Badge
                      key={role.id}
                      variant="outline"
                      className={`cursor-pointer transition-colors hover:bg-amber-50 dark:hover:bg-amber-900/20 ${
                        selectedRoleId === role.id
                          ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                          : 'text-muted-foreground'
                      }`}
                      onClick={() => handleRoleTemplateClick(role)}
                    >
                      {role.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Status — only when editing */}
          {isEditing && (
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Status</Label>
                <p className="text-xs text-muted-foreground">
                  {form.watch('isActive') ? 'Staff member is active' : 'Staff member is inactive'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    form.watch('isActive')
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                  }
                >
                  {form.watch('isActive') ? 'Active' : 'Inactive'}
                </Badge>
                <Switch
                  checked={form.watch('isActive')}
                  onCheckedChange={(checked) => form.setValue('isActive', checked)}
                  disabled={submitting}
                />
              </div>
            </div>
          )}

          <Separator />

          {/* Link Driver — only show when NOT a driver role */}
          {!isDriverRole && (
            <div className="space-y-2">
              <Label>Link Driver</Label>
              <p className="text-xs text-muted-foreground">
                Optionally link this staff member to a driver profile for driver-specific access.
              </p>
              {driversLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading drivers...
                </div>
              ) : (
                <SearchableSelect
                  options={driverOptions}
                  value={form.watch('driverId')}
                  onValueChange={(val) => form.setValue('driverId', val)}
                  placeholder="Select a driver"
                  searchPlaceholder="Search drivers..."
                  emptyMessage="No drivers found"
                  disabled={submitting || driversLoading}
                />
              )}
            </div>
          )}

        </form>
        </DialogBody>
        <DialogFooter className="gap-2 sm:gap-0 shrink-0 border-t pt-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="user-form"
            className="bg-amber-500 hover:bg-amber-600 text-white"
            disabled={submitting}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting ? 'Saving...' : isEditing ? 'Update Staff' : 'Add Staff'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
