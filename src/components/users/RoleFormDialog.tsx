'use client'

import * as React from 'react'
import { Loader2, Lock } from 'lucide-react'
import { PERMISSIONS } from '@/lib/constants'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

// ---- Types ----

interface RoleItem {
  id: string
  name: string
  description?: string | null
  userCount: number
  permissions: string[]
  isSystem?: boolean
}

interface RoleFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  role?: RoleItem | null
  onSaved: () => void
}

// ---- Permission Categories ----

const PERMISSION_CATEGORIES: { name: string; keys: string[] }[] = [
  {
    name: 'Trucks',
    keys: ['trucks.view', 'trucks.create', 'trucks.edit', 'trucks.delete'],
  },
  {
    name: 'Drivers',
    keys: ['drivers.view', 'drivers.create', 'drivers.edit', 'drivers.delete'],
  },
  {
    name: 'Trips',
    keys: ['trips.view', 'trips.create', 'trips.edit', 'trips.delete'],
  },
  {
    name: 'Expenses',
    keys: ['expenses.view', 'expenses.create', 'expenses.edit', 'expenses.approve'],
  },
  {
    name: 'Payroll',
    keys: ['payroll.view', 'payroll.create', 'payroll.approve', 'payroll.pay'],
  },
  {
    name: 'Maintenance',
    keys: ['maintenance.view', 'maintenance.create', 'maintenance.edit'],
  },
  {
    name: 'Reports',
    keys: ['reports.view', 'reports.export'],
  },
  {
    name: 'Admin',
    keys: ['admin.users', 'admin.roles', 'admin.settings'],
  },
]

// ---- Component ----

export function RoleFormDialog({ open, onOpenChange, role, onSaved }: RoleFormDialogProps) {
  const isEditing = !!role
  const isSystemRole = role?.isSystem === true
  const [submitting, setSubmitting] = React.useState(false)

  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [selectedPermissions, setSelectedPermissions] = React.useState<Set<string>>(new Set())

  // Reset form when dialog opens
  React.useEffect(() => {
    if (open) {
      if (role) {
        setName(role.name)
        setDescription(role.description || '')
        setSelectedPermissions(new Set(role.permissions))
      } else {
        setName('')
        setDescription('')
        setSelectedPermissions(new Set())
      }
    }
  }, [role, open])

  // Toggle a single permission
  function togglePermission(key: string) {
    setSelectedPermissions((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // Toggle all permissions in a category
  function toggleCategory(categoryKeys: string[]) {
    setSelectedPermissions((prev) => {
      const next = new Set(prev)
      const allSelected = categoryKeys.every((k) => next.has(k))
      if (allSelected) {
        categoryKeys.forEach((k) => next.delete(k))
      } else {
        categoryKeys.forEach((k) => next.add(k))
      }
      return next
    })
  }

  // Check if all permissions in a category are selected
  function isCategoryAllSelected(categoryKeys: string[]): boolean {
    return categoryKeys.every((k) => selectedPermissions.has(k))
  }

  // Check if some (but not all) permissions in a category are selected
  function isCategoryIndeterminate(categoryKeys: string[]): boolean {
    const selectedCount = categoryKeys.filter((k) => selectedPermissions.has(k)).length
    return selectedCount > 0 && selectedCount < categoryKeys.length
  }

  // Permission count summary
  const totalPermissions = PERMISSION_CATEGORIES.reduce((acc, cat) => acc + cat.keys.length, 0)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('Role name is required')
      return
    }

    setSubmitting(true)
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        permissions: Array.from(selectedPermissions),
      }

      if (isEditing && role) {
        const res = await fetch(`/api/roles/${role.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Failed to update role')
        }
        toast.success('Role updated successfully', {
          description: `${name} has been updated with ${body.permissions.length} permissions.`,
        })
      } else {
        const res = await fetch('/api/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Failed to create role')
        }
        toast.success('Role created successfully', {
          description: `${name} has been created with ${body.permissions.length} permissions.`,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditing ? 'Edit Role' : 'Create New Role'}
            {isSystemRole && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-normal bg-muted px-2 py-0.5 rounded-full">
                <Lock className="h-3 w-3" />
                System Role
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update role details and configure permissions below.'
              : 'Define a new role and assign granular permissions for your team.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0">
          <DialogBody className="space-y-4 flex-1">
          {/* Role Name */}
          <div className="space-y-2">
            <Label htmlFor="role-name">
              Role Name <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="role-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Fleet Manager"
                disabled={isSystemRole || submitting}
              />
              {isSystemRole && (
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              )}
            </div>
            {isSystemRole && (
              <p className="text-xs text-muted-foreground">
                System roles cannot be renamed.
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="role-description">Description</Label>
            <Textarea
              id="role-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly describe what this role does and who it's for..."
              rows={2}
              disabled={submitting}
            />
          </div>

          <Separator />

          {/* Permissions header */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Permissions</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selectedPermissions.size} of {totalPermissions} permissions selected
              </p>
            </div>
          </div>

          {/* Permission Groups */}
          <div className="space-y-3">
            {PERMISSION_CATEGORIES.map((category) => {
              const allSelected = isCategoryAllSelected(category.keys)
              const indeterminate = isCategoryIndeterminate(category.keys)

              return (
                <div
                  key={category.name}
                  className="rounded-lg border bg-card"
                >
                  {/* Category Header with Select All */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30 rounded-t-lg">
                    <Checkbox
                      id={`cat-${category.name}`}
                      checked={allSelected}
                      // For indeterminate state, we use a visual cue
                      onCheckedChange={() => toggleCategory(category.keys)}
                      disabled={submitting}
                      className={
                        indeterminate && !allSelected
                          ? 'data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500'
                          : ''
                      }
                    />
                    <label
                      htmlFor={`cat-${category.name}`}
                      className="text-sm font-semibold cursor-pointer flex-1"
                    >
                      {category.name}
                    </label>
                    <span className="text-xs text-muted-foreground">
                      {category.keys.filter((k) => selectedPermissions.has(k)).length}/{category.keys.length}
                    </span>
                  </div>

                  {/* Permission checkboxes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
                    {category.keys.map((key) => {
                      const label = PERMISSIONS[key as keyof typeof PERMISSIONS] || key
                      const isChecked = selectedPermissions.has(key)

                      return (
                        <label
                          key={key}
                          className={`
                            flex items-center gap-2.5 px-4 py-2.5 cursor-pointer
                            hover:bg-muted/50 transition-colors
                            ${category.keys.indexOf(key) < category.keys.length - 1 ? 'border-b border-border/50' : ''}
                            sm:odd:border-r
                          `}
                        >
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => togglePermission(key)}
                            disabled={submitting}
                          />
                          <span className="text-sm">{label}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          </DialogBody>
        </form>

        <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-amber-500 hover:bg-amber-600 text-white"
              disabled={submitting}
              onClick={onSubmit}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitting ? 'Saving...' : isEditing ? 'Update Role' : 'Create Role'}
            </Button>
          </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
