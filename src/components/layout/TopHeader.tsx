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
import { toast } from '@/lib/toast-config'
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
  const [time, setTime] = useState(new Date())
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1_000)
    return () => clearInterval(interval)
  }, [])

  const info = viewTitles[currentView]

  return (
    <>
    <header className="sticky top-0 z-10 h-14 backdrop-blur-xl bg-background/80 border-b border-border/50 shadow-sm flex items-center justify-between px-4 md:px-6 flex-shrink-0">
      {/* Left: Search + Title + Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={openCommandPalette}
          className="hidden sm:flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/80 transition-colors cursor-pointer border-none outline-none shrink-0"
          title="Open command palette (Alt+K)"
        >
          <Search className="size-3.5" />
          <span className="hidden md:inline">Search...</span>
          <kbd className="pointer-events-none hidden lg:inline-flex h-4 select-none items-center rounded border bg-background/50 px-1 font-mono text-[10px] font-medium text-muted-foreground">
            Alt+K
          </kbd>
        </button>
        <h2 className="text-base font-semibold text-foreground truncate">{info.title}</h2>
        <Separator orientation="vertical" className="h-4 hidden sm:block" />
        <span className="text-xs text-muted-foreground hidden sm:block">{info.breadcrumb}</span>
      </div>

      {/* Right: Date/Time + Theme + Bell + Profile */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-xs text-muted-foreground hidden lg:block px-2 py-1 rounded-md bg-muted/50 tabular-nums">
          {format(time, 'EEE, MMM d, yyyy · h:mm a')}
        </span>

        <ThemeToggle />
        <NotificationBell />

        <Separator orientation="vertical" className="h-5 hidden sm:block mx-1" />

        {/* Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="hidden sm:flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/80 transition-colors cursor-pointer outline-none">
              <Avatar className="size-7">
                <AvatarFallback className="bg-emerald-100 text-emerald-700 text-[11px] font-semibold dark:bg-emerald-900/50 dark:text-emerald-400">
                  AD
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:block text-left">
                <p className="text-xs font-medium text-foreground leading-tight">Admin</p>
                <p className="text-[10px] text-muted-foreground leading-tight">Fleet Manager</p>
              </div>
              <ChevronDown className="size-3 text-muted-foreground hidden md:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="font-normal p-0">
              <div className="rounded-lg bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 border p-3 space-y-2">
                <div className="flex items-center gap-3">
                  <Avatar className="size-10">
                    <AvatarFallback className="bg-emerald-100 text-emerald-700 text-sm font-semibold dark:bg-emerald-900/50 dark:text-emerald-400">
                      AD
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight">Admin User</p>
                    <p className="text-xs text-muted-foreground truncate">admin@lightworldtech.com</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <BadgeCheck className="size-3 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">Fleet Manager</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setCurrentView('settings')} className="cursor-pointer">
                <User className="size-4 mr-2" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCurrentView('dashboard')} className="cursor-pointer">
                <LayoutDashboard className="size-4 mr-2" />
                Dashboard
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCurrentView('reports')} className="cursor-pointer">
                <BarChart3 className="size-4 mr-2" />
                Reports
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCurrentView('settings')} className="cursor-pointer">
                <Settings className="size-4 mr-2" />
                Settings
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem className="cursor-pointer" onClick={() => setShortcutsOpen(true)}>
                <Keyboard className="size-4 mr-2" />
                Keyboard Shortcuts
                <span className="ml-auto text-[10px] text-muted-foreground">Alt+1-9,0</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" disabled>
                <HelpCircle className="size-4 mr-2" />
                Help & Support
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600 focus:text-red-600 cursor-pointer" onClick={() => toast.info('Signed out (demo mode)')}>
              <LogOut className="size-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>

      {/* Keyboard Shortcuts Dialog */}
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
                className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted transition-colors cursor-pointer text-left"
                onClick={() => { setCurrentView(item.view); setShortcutsOpen(false) }}
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
