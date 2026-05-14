'use client'

import * as React from 'react'
import { Truck, LogOut, ChevronDown, User, Settings, MapPin, Lock, Unlock, X } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { Separator } from '@/components/ui/separator'
import { navigationGroups, APP_NAME } from '@/lib/constants'
import { useAuthStore, getUserInitials, getRoleBadgeColor, canAccessNav } from '@/lib/store/auth'
import { NavGroupSection } from '@/components/layout/NavMenuShared'
import { toast } from 'sonner'

interface AppSidebarProps {
  currentPage: string
  onNavigate: (page: string) => void
}

export function AppSidebar({ currentPage, onNavigate }: AppSidebarProps) {
  const { user, logout } = useAuthStore()
  const { isMobile, setOpenMobile, state, scrollLocked, setScrollLocked } = useSidebar()

  const isCollapsed = state === 'collapsed'
  const [userMenuOpen, setUserMenuOpen] = React.useState(false)

  function handleToggleScrollLock() {
    const next = !scrollLocked
    setScrollLocked(next)
    toast.success(next ? 'Sidebar scroll locked' : 'Sidebar scroll unlocked', {
      duration: 2000,
      icon: next ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />,
    })
  }

  // Navigate + close mobile drawer + close user menu
  function handleNavigate(page: string) {
    onNavigate(page)
    if (isMobile) setOpenMobile(false)
    setUserMenuOpen(false)
  }

  // Filter navigation items based on user permissions
  const filteredNavGroups = React.useMemo(() => {
    if (!user) return navigationGroups
    return navigationGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => canAccessNav(item.id)),
      }))
      .filter((group) => group.items.length > 0)
  }, [user])

  function handleLogout() {
    logout()
    if (isMobile) setOpenMobile(false)
    setUserMenuOpen(false)
    window.dispatchEvent(new CustomEvent('navigate-page', { detail: 'dashboard' }))
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="relative">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="hover:bg-sidebar-accent">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-amber-500 text-white">
                <Truck className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-bold text-amber-600 dark:text-amber-400">{APP_NAME}</span>
                <span className="truncate text-xs text-muted-foreground">Ghana</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {/* Close button — mobile only */}
        {isMobile && (
          <button
            onClick={() => setOpenMobile(false)}
            className="absolute top-3 right-3 flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors z-10"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <div className="px-1 py-1">
          {filteredNavGroups.map((group) => (
            <NavGroupSection
              key={group.label}
              group={group}
              currentPage={currentPage}
              onNavigate={handleNavigate}
              compact={isCollapsed}
            />
          ))}
        </div>
      </SidebarContent>
      <SidebarFooter>
        <SidebarSeparator />
        <div className="flex items-center gap-1 px-2">
          {/* Scroll lock toggle */}
          <button
            onClick={handleToggleScrollLock}
            className={`
              flex items-center justify-center h-8 w-8 rounded-md shrink-0 transition-colors duration-150
              ${scrollLocked
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }
            `}
            aria-label={scrollLocked ? 'Unlock sidebar scroll' : 'Lock sidebar scroll'}
            title={scrollLocked ? 'Unlock sidebar scroll' : 'Lock sidebar scroll'}
          >
            {scrollLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
          </button>

          {/* User menu: Drawer (bottom sheet) on mobile, DropdownMenu on desktop */}
          {isMobile ? (
            <Drawer open={userMenuOpen} onOpenChange={setUserMenuOpen}>
              <DrawerTrigger asChild>
                <button className="flex flex-1 min-w-0 items-center gap-2 rounded-md p-2 hover:bg-sidebar-accent transition-colors duration-150 cursor-pointer">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs font-bold">
                      {user ? getUserInitials(user.name) : '--'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight min-w-0">
                    <span className="truncate font-semibold">
                      {user?.name || 'User'}
                    </span>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] px-1.5 py-0 h-4 w-fit ${user ? getRoleBadgeColor(user.role) : ''}`}
                    >
                      {user?.role || 'Unknown'}
                    </Badge>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </DrawerTrigger>
              <DrawerContent>
                <DrawerHeader className="text-left">
                  <div className="flex items-center justify-between">
                    <div>
                      <DrawerTitle>Account</DrawerTitle>
                      <DrawerDescription>{user?.email}</DrawerDescription>
                    </div>
                    <DrawerClose asChild>
                      <button
                        className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-muted transition-colors"
                        aria-label="Close"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </DrawerClose>
                  </div>
                </DrawerHeader>
                <div className="px-4 space-y-1">
                  <button
                    onClick={() => handleNavigate('profile')}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-muted transition-colors"
                  >
                    <User className="h-5 w-5 text-muted-foreground" />
                    <span>My Profile</span>
                  </button>
                  <button
                    onClick={() => handleNavigate('settings')}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-muted transition-colors"
                  >
                    <Settings className="h-5 w-5 text-muted-foreground" />
                    <span>Settings</span>
                  </button>
                  {user?.role === 'Driver' && (
                    <button
                      onClick={() => handleNavigate('driver-tracking')}
                      className="w-full flex items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-muted transition-colors"
                    >
                      <MapPin className="h-5 w-5 text-muted-foreground" />
                      <span>Location Sharing</span>
                    </button>
                  )}
                </div>
                <Separator className="my-2" />
                <DrawerFooter>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>
          ) : (
            <SidebarMenu className="flex-1 min-w-0">
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton
                      size="lg"
                      className="hover:bg-sidebar-accent cursor-pointer"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs font-bold">
                          {user ? getUserInitials(user.name) : '--'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-semibold">
                          {user?.name || 'User'}
                        </span>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] px-1.5 py-0 h-4 w-fit ${user ? getRoleBadgeColor(user.role) : ''}`}
                        >
                          {user?.role || 'Unknown'}
                        </Badge>
                      </div>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="start" className="w-56">
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{user?.name}</p>
                        <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleNavigate('profile')}>
                      <User className="mr-2 h-4 w-4" />
                      My Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleNavigate('settings')}>
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </DropdownMenuItem>
                    {user?.role === 'Driver' && (
                      <DropdownMenuItem onClick={() => handleNavigate('driver-tracking')}>
                        <MapPin className="mr-2 h-4 w-4" />
                        Location Sharing
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600">
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          )}
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
