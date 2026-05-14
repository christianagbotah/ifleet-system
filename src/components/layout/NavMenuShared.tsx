'use client'

import * as React from 'react'
import { type NavGroup, type NavItem, GROUP_COLORS } from '@/lib/constants'

// Re-export for convenience
export { GROUP_COLORS }

export function NavItemButton({
  item,
  isActive,
  groupColor,
  onClick,
  compact = false,
  tooltip,
}: {
  item: NavItem
  isActive: boolean
  groupColor: typeof GROUP_COLORS[string]
  onClick: (page: string) => void
  compact?: boolean
  tooltip?: string
}) {
  const button = (
    <button
      onClick={() => onClick(item.id)}
      title={tooltip || item.label}
      className={`
        flex items-center gap-3 w-full rounded-xl text-left
        transition-all duration-200 active:scale-[0.98]
        ${compact ? 'px-2 py-2' : 'px-3 py-2.5'}
        ${isActive
          ? `${groupColor.bg} ${groupColor.text}`
          : 'hover:bg-muted/60 text-foreground'
        }
      `}
    >
      <item.icon
        className={`h-4 w-4 shrink-0 ${
          isActive ? groupColor.icon : 'text-muted-foreground'
        }`}
      />
      {!compact && (
        <span className={`text-sm font-medium flex-1 truncate ${isActive ? 'font-semibold' : ''}`}>
          {item.label}
        </span>
      )}
      {!compact && item.badge && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
          {item.badge}
        </span>
      )}
    </button>
  )

  return button
}

export function NavGroupSection({
  group,
  currentPage,
  onNavigate,
  compact = false,
}: {
  group: NavGroup
  currentPage: string
  onNavigate: (page: string) => void
  compact?: boolean
}) {
  const colors = GROUP_COLORS[group.label] || GROUP_COLORS.Main

  return (
    <div>
      {!compact && (
        <div className="flex items-center gap-2 px-3 pt-3 pb-1">
          <span className={`text-[10px] font-bold uppercase tracking-wider ${colors.text}`}>
            {group.label}
          </span>
          <div className={`flex-1 h-px ${colors.bg}`} />
        </div>
      )}
      <div className={`space-y-0.5 ${compact ? '' : 'pb-1'}`}>
        {group.items.map((item, index) => (
          <React.Fragment key={item.id}>
            {index > 0 && !compact && (
              <div className="border-b border-border/40 mx-2 lg:hidden" />
            )}
            <NavItemButton
              item={item}
              isActive={currentPage === item.id}
              groupColor={colors}
              onClick={onNavigate}
              compact={compact}
              tooltip={compact ? item.label : undefined}
            />
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}
