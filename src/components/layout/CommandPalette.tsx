'use client'

import React, { useState, useEffect } from 'react'
import {
  Route,
  Truck,
  Users,
  Receipt,
  Fuel,
  Camera,
  type LucideIcon,
} from 'lucide-react'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { navigationGroups, GROUP_COLORS } from '@/lib/constants'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface CommandPaletteAction {
  id: string
  label: string
  description?: string
  icon: LucideIcon
  group: string
  action: () => void
  shortcut?: string
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate: (page: string) => void
}

// ─── Quick Actions ──────────────────────────────────────────────────────────

const QUICK_ACTIONS: Array<{
  id: string
  label: string
  icon: LucideIcon
  page: string
  color: string
  shortcut?: string
}> = [
  { id: 'qa-trip', label: 'New Trip', icon: Route, page: 'trips', color: 'text-emerald-600', shortcut: '⌘N' },
  { id: 'qa-truck', label: 'New Truck', icon: Truck, page: 'trucks', color: 'text-amber-600', shortcut: '⌘T' },
  { id: 'qa-driver', label: 'New Driver', icon: Users, page: 'drivers', color: 'text-sky-600', shortcut: '⌘D' },
  { id: 'qa-expense', label: 'Record Expense', icon: Receipt, page: 'expenses', color: 'text-rose-600', shortcut: '⌘E' },
  { id: 'qa-fuel', label: 'Log Fuel', icon: Fuel, page: 'fuel-logs', color: 'text-orange-600' },
  { id: 'qa-scan', label: 'Scan Receipt', icon: Camera, page: 'documents', color: 'text-violet-600' },
]

// ─── Recent Pages ───────────────────────────────────────────────────────────

const MAX_RECENT = 5
const STORAGE_KEY = 'fleetpro-recent-pages'

function getRecentPages(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function addRecentPage(pageId: string) {
  if (typeof window === 'undefined') return
  try {
    const existing = getRecentPages().filter((id) => id !== pageId)
    const updated = [pageId, ...existing].slice(0, MAX_RECENT)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // ignore
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CommandPalette({ open, onOpenChange, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState('')

  // Load recent pages from localStorage when palette opens
  const recentPages = React.useMemo(() => {
    if (!open) return []
    return getRecentPages()
  }, [open])

  // Reset query when palette opens
  React.useEffect(() => {
    if (open) {
      setQuery('')
    }
  }, [open])

  // Build navigation actions from navigationGroups
  const allActions = React.useMemo((): CommandPaletteAction[] => {
    const actions: CommandPaletteAction[] = []

    for (const group of navigationGroups) {
      for (const item of group.items) {
        actions.push({
          id: item.id,
          label: item.label,
          icon: item.icon,
          group: group.label,
          action: () => {
            onNavigate(item.id)
            addRecentPage(item.id)
            onOpenChange(false)
          },
        })
      }
    }

    // Add quick actions (navigate to page)
    for (const qa of QUICK_ACTIONS) {
      actions.push({
        id: qa.id,
        label: qa.label,
        icon: qa.icon,
        group: 'Quick Actions',
        action: () => {
          onNavigate(qa.page)
          addRecentPage(qa.page)
          onOpenChange(false)
        },
        shortcut: qa.shortcut,
      })
    }

    return actions
  }, [onNavigate, onOpenChange])

  // Group navigation items by their group label
  const groupedActions = React.useMemo(() => {
    const map = new Map<string, CommandPaletteAction[]>()
    for (const action of allActions) {
      const existing = map.get(action.group) || []
      existing.push(action)
      map.set(action.group, existing)
    }
    return map
  }, [allActions])

  // Recent pages lookup
  const recentActions = React.useMemo(() => {
    return recentPages
      .map((pageId) => allActions.find((a) => a.id === pageId))
      .filter((a): a is CommandPaletteAction => !!a)
  }, [recentPages, allActions])

  // Build filtered groups based on search query
  const filteredGroups = React.useMemo(() => {
    if (!query.trim()) return groupedActions

    const q = query.toLowerCase()
    const filtered = new Map<string, CommandPaletteAction[]>()

    for (const [group, actions] of groupedActions) {
      const matching = actions.filter(
        (a) =>
          a.label.toLowerCase().includes(q) ||
          a.group.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q)
      )
      if (matching.length > 0) {
        filtered.set(group, matching)
      }
    }

    return filtered
  }, [query, groupedActions])

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      className="sm:max-w-lg"
      title="Command Palette"
      description="Search modules and actions"
    >
      {/* Quick Actions Grid — shown when no search query */}
      {!query.trim() && (
        <div className="px-4 pt-4 pb-2 md:hidden">
          <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">
            Quick Actions
          </p>
          <div className="grid grid-cols-3 gap-2">
            {QUICK_ACTIONS.map((qa) => (
              <button
                key={qa.id}
                onClick={() => {
                  onNavigate(qa.page)
                  addRecentPage(qa.page)
                  onOpenChange(false)
                }}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-xl border p-3',
                  'bg-background hover:bg-accent transition-colors',
                  'active:scale-95 transition-transform'
                )}
              >
                <qa.icon className={cn('h-5 w-5', qa.color)} />
                <span className="text-xs font-medium leading-tight text-center">
                  {qa.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Desktop Quick Actions — horizontal row */}
      {!query.trim() && (
        <div className="hidden md:flex md:flex-wrap gap-2 px-3 pt-3 pb-1 border-b">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider w-full mb-1">
            Quick Actions
          </span>
          {QUICK_ACTIONS.map((qa) => (
            <CommandItem
              key={`qa-desktop-${qa.id}`}
              value={`qa ${qa.label}`}
              onSelect={() => {
                onNavigate(qa.page)
                addRecentPage(qa.page)
                onOpenChange(false)
              }}
              className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-1.5 text-xs"
            >
              <qa.icon className={cn('h-3.5 w-3.5', qa.color)} />
              <span>{qa.label}</span>
              {qa.shortcut && (
                <CommandShortcut className="text-[10px]">{qa.shortcut}</CommandShortcut>
              )}
            </CommandItem>
          ))}
        </div>
      )}

      {/* Search & Navigate */}
      <CommandInput
        placeholder="Search modules and actions..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[50vh]">
        <CommandEmpty>No modules or actions found.</CommandEmpty>

        {/* Recent Pages — only show when no search query and there are recent pages */}
        {!query.trim() && recentActions.length > 0 && (
          <>
            <CommandGroup heading="Recent">
              {recentActions.map((action) => (
                <CommandItem
                  key={`recent-${action.id}`}
                  value={`recent ${action.label}`}
                  onSelect={action.action}
                >
                  <action.icon className="h-4 w-4" />
                  <span>{action.label}</span>
                  <span className="text-xs text-muted-foreground ml-1">
                    {action.group}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Navigation Groups */}
        {Array.from(filteredGroups.entries()).map(([groupLabel, actions]) => {
          // Skip Quick Actions group in the command list (shown as buttons above)
          if (groupLabel === 'Quick Actions') return null

          const colors = GROUP_COLORS[groupLabel]

          return (
            <CommandGroup key={groupLabel} heading={groupLabel}>
              {actions.map((action) => (
                <CommandItem
                  key={action.id}
                  value={action.label}
                  onSelect={action.action}
                >
                  <span className={cn('rounded-sm p-0.5', colors?.bg)}>
                    <action.icon className={cn('h-4 w-4', colors?.icon)} />
                  </span>
                  <span>{action.label}</span>
                  {action.shortcut && (
                    <CommandShortcut>{action.shortcut}</CommandShortcut>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )
        })}
      </CommandList>

      {/* Footer hint */}
      <div className="border-t px-4 py-2 text-center text-[11px] text-muted-foreground">
        <span className="hidden sm:inline">
          Navigate with <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">↑↓</kbd> · Select with{' '}
          <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">Enter</kbd> · Close with{' '}
          <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">Esc</kbd>
        </span>
        <span className="sm:hidden">Tap to navigate</span>
      </div>
    </CommandDialog>
  )
}
