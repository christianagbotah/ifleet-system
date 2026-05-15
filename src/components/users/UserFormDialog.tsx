'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Briefcase, Hash } from 'lucide-react'
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
  email: string
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
  /** Pre-fill department for "Add Staff" shortcut */
  prefillDepartment?: string
  /** Pre-fill roleId for "Add Staff" shortcut */
  prefillRoleId?: string
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

// ---- Schema ----

const createUserSchema = z.object({
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
})

const editUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  phone: z.string().optional().or(z.literal('')),
  roleId: z.string().min(1, 'Role is required'),
  driverId: z.string().optional(),
  isActive: z.boolean(),
  position: z.string().optional().or(z.literal('')),
  department: z.string().optional().or(z.literal('')),
  employeeNumber: z.string().optional().or(z.literal('')),
})

type CreateUserFormValues = z.infer<typeof createUserSchema>
type EditUserFormValues = z.infer<typeof editUserSchema>

// ---- Component ----

export function UserFormDialog({ open, onOpenChange, user, roles, onSaved, prefillDepartment, prefillRoleId }: UserFormDialogProps) {
  const isEditing = !!user
  const [submitting, setSubmitting] = React.useState(false)
  const [drivers, setDrivers] = React.useState<DriverOption[]>([])
  const [driversLoading, setDriversLoading] = React.useState(false)

  const form = useForm<CreateUserFormValues & EditUserFormValues>({
    resolver: zodResolver(isEditing ? editUserSchema : createUserSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      password: '',
      roleId: prefillRoleId || '',
      driverId: '',
      isActive: true,
      position: '',
      department: prefillDepartment || '',
      employeeNumber: '',
    },
  })

  // Reset form when dialog opens or user changes
  React.useEffect(() => {
    if (open) {
      if (user) {
        form.reset({
          name: user.name,
          email: user.email,
          phone: user.phone || '',
          password: '',
          roleId: user.roleId,
          driverId: user.driverId || '',
          isActive: user.isActive,
          position: user.position || '',
          department: user.department || '',
          employeeNumber: user.employeeNumber || '',
        })
      } else {
        form.reset({
          name: '',
          email: '',
          phone: '',
          password: '',
          roleId: prefillRoleId || '',
          driverId: '',
          isActive: true,
          position: '',
          department: prefillDepartment || '',
          employeeNumber: '',
        })
      }
    }
  }, [user, form, open, prefillRoleId, prefillDepartment])

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
    const staffRoles = roles.filter(
      (r) => !r.isSystem || r.name === 'Driver'
    )
    return staffRoles.filter((r) =>
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
      description: `Role, department, and position pre-filled.`,
    })
  }

  async function onSubmit(data: CreateUserFormValues & EditUserFormValues) {
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        roleId: data.roleId,
        isActive: data.isActive,
        driverId: data.driverId || null,
        position: data.position || null,
        department: data.department || null,
        employeeNumber: data.employeeNumber || null,
      }

      if (!isEditing) {
        body.password = data.password
      }

      if (isEditing && user) {
        const res = await fetch(`/api/users/${user.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Failed to update user')
        }
        toast.success('User updated successfully', {
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
          throw new Error(err.error || 'Failed to create user')
        }
        toast.success('User created successfully', {
          description: `${data.name} has been added.`,
        })
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
  const selectedDepartment = form.watch('department')

  // Determine if current role is a driver role
  const isDriverRole = selectedRole?.name === 'Driver'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit User' : prefillDepartment ? 'Add Staff Member' : 'Add New User'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update user information, role, and staff details below.'
              : prefillDepartment
                ? 'Fill in the details to create a new staff account.'
                : 'Fill in the details to create a new user account.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex-1 min-h-0 overflow-y-auto">
        <form id="user-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Name & Email */}
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
          </div>

          {/* Phone & Role */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                placeholder="+233 XX XXX XXXX"
                {...form.register('phone')}
              />
            </div>
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
          </div>

          {/* Password — only for new users */}
          {!isEditing && (
            <div className="space-y-2">
              <Label htmlFor="password">
                Password <span className="text-destructive">*</span>
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Minimum 4 characters"
                {...form.register('password')}
              />
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>
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

          {/* Quick Role Templates — only for new users, when no department is pre-filled */}
          {!isEditing && !prefillDepartment && staffRoleTemplates.length > 0 && (
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
                  {form.watch('isActive') ? 'User can sign in and access the system' : 'User is suspended and cannot sign in'}
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
                Optionally link this user to a driver profile for driver-specific access.
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
            {submitting ? 'Saving...' : isEditing ? 'Update User' : 'Create User'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
