'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useAppStore, type ViewName } from '@/lib/store'
import { getUserInitials, useAuthStore } from '@/lib/store/auth'
import { ThemeToggle } from './ThemeToggle'
import { NotificationBell } from './NotificationBell'
import {
  User,
  Settings,
  HelpCircle,
  LogOut,
  ChevronDown,
  Keyboard,
  LayoutDashboard,
  BarChart3,
  BadgeCheck,
  Search,
} from 'lucide-react'
import { openCommandPalette } from './CommandPalette'

const viewTitles: Record<ViewName, { title: string; breadcrumb: string }> = {
  dashboard: { title: 'Dashboard', breadcrumb: 'Dashboard' },
  drivers: { title: 'Drivers', breadcrumb: 'Fleet > Drivers' },
  trucks: { title: 'Trucks', breadcrumb: 'Fleet > Trucks' },
  warehouses: { title: 'Warehouses', breadcrumb: 'Locations > Warehouses' },
  'zone-rates': { title: 'Zone Rates', breadcrumb: 'Finance > Zone Rates' },
  trips: { title: 'Trips', breadcrumb: 'Operations > Trips' },
  'trip-calendar': { title: 'Trip Calendar', breadcrumb: 'Operations > Trip Calendar' },
  'cash-advances': { title: 'Cash Advances', breadcrumb: 'Finance > Cash Advances' },
  incentives: { title: 'Incentives', breadcrumb: 'Finance > Incentives' },
  reports: { title: 'Reports', breadcrumb: 'Analytics > Reports' },
  settings: { title: 'Settings', breadcrumb: 'System > Settings' },
}

const shortcutItems = [
  { key: 'Alt+1', label: 'Dashboard', view: 'dashboard' as ViewName },
  { key: 'Alt+2', label: 'Drivers', view: 'drivers' as ViewName },
  { key: 'Alt+3', label: 'Trucks', view: 'trucks' as ViewName },
  { key: 'Alt+4', label: 'Warehouses', view: 'warehouses' as ViewName },
  { key: 'Alt+5', label: 'Zone Rates', view: 'zone-rates' as ViewName },
  { key: 'Alt+6', label: 'Trips', view: 'trips' as ViewName },
  { key: 'Alt+7', label: 'Cash Advances', view: 'cash-advances' as ViewName },
  { key: 'Alt+8', label: 'Incentives', view: 'incentives' as ViewName },
  { key: 'Alt+9', label: 'Reports', view: 'reports' as ViewName },
  { key: 'Alt+0', label: 'Trip Calendar', view: 'trip-calendar' as ViewName },
]

export function TopHeader() {
  const { currentView, setCurrentView } = useAppStore()
  const { user, logout } = useAuthStore()
  const [time, setTime] = useState(new Date())
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1_000)
    return () => clearInterval(interval)
  }, [])

  const info = viewTitles[currentView]
  const displayName = user?.name || 'Account'
  const displayRole = user?.position || user?.role || 'Authenticated user'
  const displayEmail = user?.email || 'Authenticated session'
  const initials = getUserInitials(displayName)

  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 flex-shrink-0 items-center justify-between border-b border-border/50 bg-background/80 px-4 shadow-sm backdrop-blur-xl md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={openCommandPalette}
            className="hidden shrink-0 cursor-pointer items-center gap-2 rounded-lg border-none bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted/80 sm:flex"
            title="Open command palette (Alt+K)"
          >
            <Search className="size-3.5" />
            <span className="hidden md:inline">Search...</span>
            <kbd className="pointer-events-none hidden h-4 select-none items-center rounded border bg-background/50 px-1 font-mono text-[10px] font-medium text-muted-foreground lg:inline-flex">
              Alt+K
            </kbd>
          </button>
          <h2 className="truncate text-base font-semibold text-foreground">{info.title}</h2>
          <Separator orientation="vertical" className="hidden h-4 sm:block" />
          <span className="hidden text-xs text-muted-foreground sm:block">{info.breadcrumb}</span>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1.5">
          <span className="hidden rounded-md bg-muted/50 px-2 py-1 text-xs tabular-nums text-muted-foreground lg:block">
            {format(time, 'EEE, MMM d, yyyy · h:mm a')}
          </span>

          <ThemeToggle />
          <NotificationBell />
          <Separator orientation="vertical" className="mx-1 hidden h-5 sm:block" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="hidden cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 outline-none transition-colors hover:bg-muted/80 sm:flex">
                <Avatar className="size-7">
                  <AvatarFallback className="bg-emerald-100 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden text-left md:block">
                  <p className="max-w-32 truncate text-xs font-medium leading-tight text-foreground">{user?.name || displayName}</p>
                  <p className="max-w-32 truncate text-[10px] leading-tight text-muted-foreground">{user?.role || displayRole}</p>
                </div>
                <ChevronDown className="hidden size-3 text-muted-foreground md:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="space-y-2 rounded-lg border bg-gradient-to-br from-emerald-50 to-teal-50 p-3 dark:from-emerald-950/40 dark:to-teal-950/40">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-10">
                      <AvatarFallback className="bg-emerald-100 text-sm font-semibold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold leading-tight">{user?.name || displayName}</p>
                      <p className="truncate text-xs text-muted-foreground">{user?.email || displayEmail}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <BadgeCheck className="size-3 text-emerald-600 dark:text-emerald-400" />
                    <span className="truncate text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                      {user?.role || displayRole}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setCurrentView('settings')} className="cursor-pointer">
                  <User className="mr-2 size-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCurrentView('dashboard')} className="cursor-pointer">
                  <LayoutDashboard className="mr-2 size-4" />
                  Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCurrentView('reports')} className="cursor-pointer">
                  <BarChart3 className="mr-2 size-4" />
                  Reports
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCurrentView('settings')} className="cursor-pointer">
                  <Settings className="mr-2 size-4" />
                  Settings
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem className="cursor-pointer" onClick={() => setShortcutsOpen(true)}>
                  <Keyboard className="mr-2 size-4" />
                  Keyboard Shortcuts
                  <span className="ml-auto text-[10px] text-muted-foreground">Alt+1-9,0</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer" disabled>
                  <HelpCircle className="mr-2 size-4" />
                  Help & Support
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer text-red-600 focus:text-red-600" onClick={logout}>
                <LogOut className="mr-2 size-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="size-5" />
              Keyboard Shortcuts
            </DialogTitle>
            <DialogDescription>
              Navigate quickly between pages using these shortcuts.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5 py-2">
            {shortcutItems.map((item) => (
              <button
                key={item.key}
                className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted"
                onClick={() => {
                  setCurrentView(item.view)
                  setShortcutsOpen(false)
                }}
              >
                <span className="text-sm">{item.label}</span>
                <kbd className="pointer-events-none inline-flex h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[11px] font-medium text-muted-foreground">
                  {item.key}
                </kbd>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
