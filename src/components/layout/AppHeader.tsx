'use client'

import * as React from 'react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Search, Sun, Moon, LogOut, User, Settings, ArrowLeft } from 'lucide-react'
import { useTheme } from 'next-themes'
import { navigationGroups, APP_NAME } from '@/lib/constants'
import { useAuthStore, getUserInitials, getRoleBadgeColor } from '@/lib/store/auth'
import { NotificationBellDropdown } from '@/components/notifications/NotificationBellDropdown'
import { ConnectionStatusDot } from '@/components/layout/OfflineIndicator'

interface AppHeaderProps {
  currentPage: string
  onNavigate?: (page: string) => void
}

export function AppHeader({ currentPage, onNavigate }: AppHeaderProps) {
  const [mounted, setMounted] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [searchOpen, setSearchOpen] = React.useState(false)
  const { setTheme, theme } = useTheme()
  const { user, logout } = useAuthStore()

  React.useEffect(() => { setMounted(true) }, [])

  // Find the current page label and group's first item
  let currentLabel = { group: 'Main', label: 'Dashboard', groupId: 'dashboard' }
  for (const group of navigationGroups) {
    const item = group.items.find((i) => i.id === currentPage)
    if (item) {
      currentLabel = { group: group.label, label: item.label, groupId: group.items[0]?.id || 'dashboard' }
      break
    }
  }

  return (
    <header className="flex h-12 sm:h-14 shrink-0 items-center gap-1.5 sm:gap-2 border-b px-3 sm:px-4">
      {/* Sidebar trigger — visible on ALL screen sizes (mobile = overlay drawer) */}
      <SidebarTrigger className="-ml-1" onClick={() => {}} />
      <Separator orientation="vertical" className="mr-2 h-4" />

      {/* Mobile: back button (uses browser history) */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden h-8 w-8"
        onClick={() => window.history.back()}
        aria-label="Go back"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      {/* Mobile: page title */}
      <h1 className="text-sm font-semibold truncate md:hidden max-w-[140px] sm:max-w-[200px]">
        {currentLabel.label}
      </h1>

      {/* Desktop: breadcrumbs */}
      <Breadcrumb className="hidden md:flex">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="#" onClick={(e) => { e.preventDefault(); onNavigate?.('dashboard') }}>{APP_NAME}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="#" onClick={(e) => { e.preventDefault(); onNavigate?.(currentLabel.groupId) }}>{currentLabel.group}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{currentLabel.label}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-2">
        {/* Desktop: search bar */}
        <div className="relative hidden lg:block" onBlur={() => setTimeout(() => setSearchOpen(false), 200)}>
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Search modules..."
            className="w-48 lg:w-64 h-9 pl-8"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true) }}
            onFocus={() => setSearchOpen(true)}
          />
          {searchOpen && searchQuery.length > 0 && (
            <div className="absolute top-full mt-1 w-full bg-popover border rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
              {navigationGroups.flatMap(g => g.items).filter(i =>
                i.label.toLowerCase().includes(searchQuery.toLowerCase())
              ).map(item => (
                <button
                  key={item.id}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center gap-2 transition-colors"
                  onClick={() => { onNavigate?.(item.id); setSearchQuery(''); setSearchOpen(false) }}
                >
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <ConnectionStatusDot />

        <NotificationBellDropdown onNavigate={onNavigate} />

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle theme"
        >
          {mounted && theme === 'dark' ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>

        <Separator orientation="vertical" className="h-4" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs font-bold">
                  {user ? getUserInitials(user.name) : '??'}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.name || 'User'}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user?.email || ''}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onNavigate?.('profile')}>
              <User className="mr-2 h-4 w-4" />
              <span>Profile</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onNavigate?.('settings')}>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { logout(); onNavigate?.('dashboard') }}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
