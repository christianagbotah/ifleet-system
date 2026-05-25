'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Search,
  Shield,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  Users,
  Phone,
  Mail,
  Clock,
  UserCog,
  Briefcase,
  Building2,
  Hash,
  Monitor,
  UserRound,
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SearchableSelect, type SearchableOption } from '@/components/ui/searchable-select'

import { UserFormDialog } from '@/components/users/UserFormDialog'
import { RoleFormDialog } from '@/components/users/RoleFormDialog'
import { PERMISSIONS } from '@/lib/constants'
import {
  fetchUsers,
  fetchRoles,
  updateUser,
  deleteRole,
  type UserItem,
  type RoleItem,
} from '@/lib/api'
import { useDebounce } from '@/hooks/use-debounce'

// ---- Animation Variants ----

const containerVariants = {
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  show: { opacity: 1, y: 0 },
}

// ---- Constants ----

const ROLE_COLORS: Record<string, string> = {
  Admin: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Manager: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  Driver: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  Dispatcher: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  Mechanic: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  Accountant: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  'Warehouse Manager': 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  HR: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  'Operations Manager': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
}
const DEFAULT_ROLE_COLOR = 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'

const DEPARTMENT_COLORS: Record<string, string> = {
  Operations: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  Maintenance: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  Finance: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  HR: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  Warehouse: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  Management: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

const DEPARTMENTS = [
  'Operations',
  'Maintenance',
  'Finance',
  'HR',
  'Warehouse',
  'Management',
]

function getRoleBadgeColor(roleName: string): string {
  if (ROLE_COLORS[roleName]) return ROLE_COLORS[roleName]
  return DEFAULT_ROLE_COLOR
}

function getDepartmentBadgeColor(dept: string): string {
  return DEPARTMENT_COLORS[dept] || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
}

// ---- Permission Grouping ----

function getGroupedPermissions() {
  const groups: Record<string, string[]> = {}
  Object.entries(PERMISSIONS).forEach(([key]) => {
    const category = key.split('.')[0]
    const categoryLabels: Record<string, string> = {
      trucks: 'Trucks',
      drivers: 'Drivers',
      trips: 'Trips',
      expenses: 'Expenses',
      payroll: 'Payroll',
      maintenance: 'Maintenance',
      reports: 'Reports',
      admin: 'Admin',
    }
    const cat = categoryLabels[category] || category
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(key)
  })
  return groups
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ---- Component ----

export function UsersView() {
  const groupedPermissions = React.useMemo(() => getGroupedPermissions(), [])

  // Data state
  const [users, setUsers] = React.useState<UserItem[]>([])
  const [usersTotal, setUsersTotal] = React.useState(0)
  const [roles, setRoles] = React.useState<RoleItem[]>([])
  const [usersLoading, setUsersLoading] = React.useState(true)
  const [rolesLoading, setRolesLoading] = React.useState(true)

  // Filters
  const [searchQuery, setSearchQuery] = React.useState('')
  const [roleFilter, setRoleFilter] = React.useState<string>('all')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [departmentFilter, setDepartmentFilter] = React.useState<string>('all')

  // Dialogs
  const [staffDialogOpen, setStaffDialogOpen] = React.useState(false)
  const [editingUser, setEditingUser] = React.useState<UserItem | null>(null)
  const [roleDialogOpen, setRoleDialogOpen] = React.useState(false)
  const [editingRole, setEditingRole] = React.useState<RoleItem | null>(null)

  // Toggle loading states
  const [togglingUser, setTogglingUser] = React.useState<string | null>(null)

  // ---- Data Fetching ----

  async function loadUsers() {
    setUsersLoading(true)
    try {
      const data = await fetchUsers({
        search: searchQuery || undefined,
        roleId: roleFilter && roleFilter !== 'all' ? roleFilter : undefined,
        status: statusFilter && statusFilter !== 'all' ? statusFilter : undefined,
        department: departmentFilter && departmentFilter !== 'all' ? departmentFilter : undefined,
        limit: 100,
      })
      setUsers(data.data || [])
      setUsersTotal(data.total ?? (data.data?.length ?? 0))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setUsersLoading(false)
    }
  }

  async function loadRoles() {
    setRolesLoading(true)
    try {
      const data = await fetchRoles()
      setRoles(Array.isArray(data) ? data : data.data || [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load roles')
    } finally {
      setRolesLoading(false)
    }
  }

  React.useEffect(() => {
    loadUsers()
    loadRoles()
  }, [roleFilter, statusFilter, departmentFilter])

  // Debounced search
  const debouncedSearch = useDebounce(searchQuery, 300)

  React.useEffect(() => {
    loadUsers()
  }, [debouncedSearch])

  // ---- Handlers ----

  function handleOpenAddStaff() {
    setEditingUser(null)
    setStaffDialogOpen(true)
  }

  function handleOpenEditUser(user: UserItem) {
    setEditingUser(user)
    setStaffDialogOpen(true)
  }

  function handleUserSaved() {
    loadUsers()
    loadRoles() // roles may have userCount changes
  }

  function handleOpenAddRole() {
    setEditingRole(null)
    setRoleDialogOpen(true)
  }

  function handleOpenEditRole(role: RoleItem) {
    setEditingRole(role)
    setRoleDialogOpen(true)
  }

  function handleRoleSaved() {
    loadRoles()
  }

  async function handleToggleUserStatus(user: UserItem) {
    const newStatus = !user.isActive
    setTogglingUser(user.id)
    try {
      await updateUser(user.id, { isActive: newStatus })
      toast.success(newStatus ? 'User activated' : 'User deactivated', {
        description: `${user.name} has been ${newStatus ? 'activated' : 'deactivated'}.`,
      })
      loadUsers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update user status')
    } finally {
      setTogglingUser(null)
    }
  }

  async function handleDeleteRole(role: RoleItem) {
    if (role.isSystem) {
      toast.error('Cannot delete system roles')
      return
    }
    if (role.userCount > 0) {
      toast.error('Cannot delete role with assigned users', {
        description: `Reassign ${role.userCount} user(s) before deleting.`,
      })
      return
    }
    if (!window.confirm(`Are you sure you want to delete the "${role.name}" role? This action cannot be undone.`)) {
      return
    }
    try {
      await deleteRole(role.id)
      toast.success('Role deleted', {
        description: `"${role.name}" has been deleted.`,
      })
      loadRoles()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete role')
    }
  }

  // ---- Filter Options ----

  const roleFilterOptions: SearchableOption[] = React.useMemo(
    () => [
      { value: 'all', label: 'All Roles' },
      ...roles.map((r) => ({ value: r.id, label: r.name, description: `${r.userCount} users` })),
    ],
    [roles]
  )

  const statusFilterOptions: SearchableOption[] = React.useMemo(
    () => [
      { value: 'all', label: 'All Statuses' },
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Inactive' },
    ],
    []
  )

  const departmentFilterOptions: SearchableOption[] = React.useMemo(
    () => [
      { value: 'all', label: 'All Departments' },
      ...DEPARTMENTS.map((d) => ({ value: d, label: d })),
    ],
    []
  )

  // ---- Stats ----
  const staffCount = React.useMemo(() => users.filter((u) => u.department).length, [users])
  const departmentCounts = React.useMemo(() => {
    const counts: Record<string, number> = {}
    users.forEach((u) => {
      if (u.department) {
        counts[u.department] = (counts[u.department] || 0) + 1
      }
    })
    return counts
  }, [users])

  // ---- Render: Users Tab ----

  function renderUsersContent() {
    if (usersLoading) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      )
    }

    if (users.length === 0) {
      return (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-base font-medium text-muted-foreground">No users found</h3>
            <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
              {searchQuery || roleFilter !== 'all' || statusFilter !== 'all' || departmentFilter !== 'all'
                ? 'Try adjusting your search or filter criteria.'
                : 'Get started by adding the first user to your fleet management system.'}
            </p>
            {!searchQuery && roleFilter === 'all' && statusFilter === 'all' && departmentFilter === 'all' && (
              <Button
                onClick={handleOpenAddStaff}
                className="bg-amber-500 hover:bg-amber-600 text-white"
              >
                <UserRound className="mr-2 h-4 w-4" />
                Add Staff
              </Button>
            )}
          </CardContent>
        </Card>
      )
    }

    return (
      <>
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Login</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-700 dark:text-amber-400 text-xs font-bold shrink-0">
                        {getInitials(user.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{user.name}</div>
                        <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                          <Mail className="h-3 w-3 shrink-0" />
                          {user.email || <span className="text-muted-foreground/50">No email</span>}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.role && (
                      <Badge
                        variant="outline"
                        className={getRoleBadgeColor(user.role.name)}
                      >
                        {user.role.name}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.department ? (
                      <Badge
                        variant="outline"
                        className={`text-[11px] ${getDepartmentBadgeColor(user.department)}`}
                      >
                        {user.department}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground/50 text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
                    {user.position || <span className="text-muted-foreground/50">—</span>}
                  </TableCell>
                  <TableCell>
                    {user.email ? (
                      <Badge
                        variant="outline"
                        className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      >
                        <Monitor className="h-3 w-3 mr-1" />
                        Can Login
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      >
                        <UserRound className="h-3 w-3 mr-1" />
                        Staff Only
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        user.isActive
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }
                    >
                      {user.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.email ? formatRelativeDate(user.lastLogin) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleOpenEditUser(user)}
                        title="Edit user"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-8 w-8 ${user.isActive ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20' : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`}
                        onClick={() => handleToggleUserStatus(user)}
                        disabled={togglingUser === user.id}
                        title={user.isActive ? 'Deactivate user' : 'Activate user'}
                      >
                        {togglingUser === user.id ? (
                          <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : user.isActive ? (
                          <PowerOff className="h-4 w-4" />
                        ) : (
                          <Power className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y">
          {users.map((user) => (
            <Card key={user.id} className="mobile-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-700 dark:text-amber-400 text-sm font-bold shrink-0">
                    {getInitials(user.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{user.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{user.email || 'No email'}</div>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    user.isActive
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 shrink-0'
                  }
                >
                  {user.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  {user.role ? (
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getRoleBadgeColor(user.role.name)}`}>
                      {user.role.name}
                    </Badge>
                  ) : (
                    <span>No role</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  {user.department ? (
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getDepartmentBadgeColor(user.department)}`}>
                      {user.department}
                    </Badge>
                  ) : (
                    <span>—</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Monitor className="h-3.5 w-3.5" />
                  {user.email ? (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      Can Login
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                      Staff Only
                    </Badge>
                  )}
                </div>
                {user.position && (
                  <div className="flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5" />
                    <span className="truncate">{user.position}</span>
                  </div>
                )}
                {user.employeeNumber && (
                  <div className="flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5" />
                    <span className="truncate">{user.employeeNumber}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  {user.phone || '—'}
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {user.email ? formatRelativeDate(user.lastLogin) : '—'}
                </div>
              </div>

              <Separator className="my-3" />

              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 min-h-[44px] text-xs"
                  onClick={() => handleOpenEditUser(user)}
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-8 min-h-[44px] text-xs ${user.isActive ? 'text-amber-600 border-amber-300 hover:bg-amber-50 dark:border-amber-800 dark:hover:bg-amber-900/20' : 'text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-900/20'}`}
                  onClick={() => handleToggleUserStatus(user)}
                  disabled={togglingUser === user.id}
                >
                  {togglingUser === user.id ? (
                    <span className="mr-1.5 h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : user.isActive ? (
                    <PowerOff className="mr-1.5 h-3.5 w-3.5" />
                  ) : (
                    <Power className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {user.isActive ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {/* Result count */}
        <div className="text-xs text-muted-foreground text-right mt-2">
          {users.length} user{users.length !== 1 ? 's' : ''} shown
        </div>
      </>
    )
  }

  // ---- Render: Permission Group ----

  function renderPermissionGroup(group: string, permissions: string[]) {
    return (
      <div key={group} className="space-y-1.5">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group}</h4>
        <div className="flex flex-wrap gap-1.5">
          {permissions.map((perm) => (
            <Badge key={perm} variant="outline" className="text-xs font-normal">
              {PERMISSIONS[perm as keyof typeof PERMISSIONS] || perm}
            </Badge>
          ))}
        </div>
      </div>
    )
  }

  // ---- Render: Roles Tab ----

  function renderRolesContent() {
    if (rolesLoading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-lg" />
          ))}
        </div>
      )
    }

    if (roles.length === 0) {
      return (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Shield className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-base font-medium text-muted-foreground">No roles defined</h3>
            <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
              Create your first role to define permission sets for your team.
            </p>
            <Button
              onClick={handleOpenAddRole}
              className="mt-4 bg-amber-500 hover:bg-amber-600 text-white"
            >
              <Shield className="mr-2 h-4 w-4" />
              Create Role
            </Button>
          </CardContent>
        </Card>
      )
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {roles.map((role) => {
          const borderColor = role.isSystem
            ? 'border-l-4 border-l-amber-400 dark:border-l-amber-600'
            : 'border-l-4 border-l-sky-400 dark:border-l-sky-600'

          return (
            <motion.div
              key={role.id}
              variants={itemVariants}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Card className={`${borderColor}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <CardTitle className="text-base truncate">{role.name}</CardTitle>
                      {role.isSystem && (
                        <Badge
                          variant="outline"
                          className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] px-1.5 py-0 shrink-0"
                        >
                          System
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleOpenEditRole(role)}
                        title="Edit role"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {!role.isSystem && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={() => handleDeleteRole(role)}
                          disabled={role.userCount > 0}
                          title={
                            role.userCount > 0
                              ? `Cannot delete: ${role.userCount} users assigned`
                              : 'Delete role'
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {role.description && (
                    <CardDescription className="text-sm">{role.description}</CardDescription>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {role.userCount} user{role.userCount !== 1 ? 's' : ''} assigned
                    </span>
                    <span className="flex items-center gap-1">
                      <Shield className="h-3.5 w-3.5" />
                      {role.permissions.length} permission{role.permissions.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(groupedPermissions)
                      .filter(([, perms]) => perms.some((p) => role.permissions.includes(p)))
                      .map(([group, allPerms]) =>
                        renderPermissionGroup(
                          group,
                          allPerms.filter((p) => role.permissions.includes(p))
                        )
                      )}
                    {role.permissions.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">No permissions assigned</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>
    )
  }

  // ---- Main Render ----

  return (
    <motion.div
      variants={containerVariants}
      animate="show"
      className="space-y-4 sm:space-y-6"
    >
      <Tabs defaultValue="users" className="w-full">
        {/* Tab header with custom layout */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <TabsList>
              <TabsTrigger value="users" className="gap-1.5">
                <Users className="h-4 w-4" />
                Users
              </TabsTrigger>
              <TabsTrigger value="roles" className="gap-1.5">
                <Shield className="h-4 w-4" />
                Roles &amp; Permissions
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* ========== Users Tab ========== */}
        <TabsContent value="users" className="space-y-4 sm:space-y-6 mt-0">
          {/* Header */}
          <motion.div variants={itemVariants} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                  <UserCog className="h-6 w-6" />
                  User Management
                </h1>
                <p className="text-muted-foreground mt-0.5">
                  Add staff members and optionally grant them system login access
                </p>
              </div>
              <Button
                onClick={handleOpenAddStaff}
                className="bg-amber-500 hover:bg-amber-600 text-white shrink-0"
              >
                <UserRound className="mr-2 h-4 w-4" />
                Add Staff
              </Button>
            </div>
          </motion.div>

          {/* Stats Cards */}
          {staffCount > 0 && (
            <motion.div variants={itemVariants} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.02 }}>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {DEPARTMENTS.map((dept) => {
                  const count = departmentCounts[dept] || 0
                  if (count === 0) return null
                  return (
                    <Card key={dept} className="p-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground truncate">{dept}</p>
                          <p className="text-lg font-bold">{count}</p>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </motion.div>
          )}

          {/* Filters */}
          <motion.div variants={itemVariants} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 }}>
            <Card className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email, or phone..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="w-full sm:w-44">
                    <SearchableSelect
                      options={roleFilterOptions}
                      value={roleFilter}
                      onValueChange={setRoleFilter}
                      placeholder="All Roles"
                      searchPlaceholder="Search roles..."
                      emptyMessage="No roles found"
                    />
                  </div>
                  <div className="w-full sm:w-40">
                    <SearchableSelect
                      options={departmentFilterOptions}
                      value={departmentFilter}
                      onValueChange={setDepartmentFilter}
                      placeholder="All Departments"
                      emptyMessage="No departments"
                    />
                  </div>
                  <div className="w-full sm:w-40">
                    <SearchableSelect
                      options={statusFilterOptions}
                      value={statusFilter}
                      onValueChange={setStatusFilter}
                      placeholder="All Statuses"
                      emptyMessage="No status options"
                    />
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Users list */}
          <motion.div variants={itemVariants} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.1 }}>
            {renderUsersContent()}
          </motion.div>
        </TabsContent>

        {/* ========== Roles Tab ========== */}
        <TabsContent value="roles" className="space-y-4 sm:space-y-6 mt-0">
          {/* Header */}
          <motion.div variants={itemVariants} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                  <Shield className="h-6 w-6" />
                  Roles &amp; Permissions
                </h1>
                <p className="text-muted-foreground mt-0.5">Define roles and manage permission sets</p>
              </div>
              <Button
                onClick={handleOpenAddRole}
                className="bg-amber-500 hover:bg-amber-600 text-white shrink-0"
              >
                <Shield className="mr-2 h-4 w-4" />
                Create Role
              </Button>
            </div>
          </motion.div>

          {/* Role cards */}
          {renderRolesContent()}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <UserFormDialog
        open={staffDialogOpen}
        onOpenChange={setStaffDialogOpen}
        user={editingUser}
        roles={roles}
        onSaved={handleUserSaved}
      />
      <RoleFormDialog
        open={roleDialogOpen}
        onOpenChange={setRoleDialogOpen}
        role={editingRole}
        onSaved={handleRoleSaved}
      />
    </motion.div>
  )
}
