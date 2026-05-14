'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, ArrowRight, Activity, Plus, Edit, Trash2, Truck, Bell, ExternalLink, Clock, User, Hash, Globe } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { fetchActivityFeed, type ActivityItem } from '@/lib/api'
import { useHighlightStore } from '@/lib/store/highlight'

// ============ Relative Time Helper ============

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function formatFullDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return dateStr }
}

// ============ Icon Config ============

interface IconConfig {
  icon: React.ElementType
  bgColor: string
  textColor: string
}

function getActivityIcon(item: ActivityItem): IconConfig {
  if (item.type === 'audit') {
    switch (item.action) {
      case 'create':
        return {
          icon: Plus,
          bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
          textColor: 'text-emerald-600 dark:text-emerald-400',
        }
      case 'delete':
        return {
          icon: Trash2,
          bgColor: 'bg-red-100 dark:bg-red-900/30',
          textColor: 'text-red-600 dark:text-red-400',
        }
      case 'update':
        return {
          icon: Edit,
          bgColor: 'bg-sky-100 dark:bg-sky-900/30',
          textColor: 'text-sky-600 dark:text-sky-400',
        }
      default:
        return {
          icon: Activity,
          bgColor: 'bg-gray-100 dark:bg-gray-900/30',
          textColor: 'text-gray-600 dark:text-gray-400',
        }
    }
  }

  if (item.type === 'trip_event') {
    return {
      icon: Truck,
      bgColor: 'bg-amber-100 dark:bg-amber-900/30',
      textColor: 'text-amber-600 dark:text-amber-400',
    }
  }

  if (item.type === 'notification') {
    return {
      icon: Bell,
      bgColor: 'bg-violet-100 dark:bg-violet-900/30',
      textColor: 'text-violet-600 dark:text-violet-400',
    }
  }

  return {
    icon: Activity,
    bgColor: 'bg-gray-100 dark:bg-gray-900/30',
    textColor: 'text-gray-600 dark:text-gray-400',
  }
}

function getActionBadgeColor(action: string | undefined): string {
  switch (action) {
    case 'create': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    case 'update': return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
    case 'delete': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    default: return 'bg-muted text-muted-foreground'
  }
}

// ============ Entity → Page Route Mapping ============

function resolveTargetPage(item: ActivityItem): string | null {
  if (item.link) return item.link
  switch (item.entityType) {
    case 'truck': return 'trucks'
    case 'driver': return 'drivers'
    case 'trip': return 'trips'
    case 'expense': return 'expenses'
    case 'fuellog': return 'fuel-logs'
    case 'maintenancerecord': return 'maintenance'
    case 'tyre': return 'tyres'
    case 'insurance': return 'insurance'
    case 'payroll': return 'payroll'
    case 'client': return 'clients'
    case 'invoice': return 'invoices'
    case 'notification': return 'notifications'
    case 'cashadvance': return 'cash-advances'
    case 'driverwallet': return 'cash-advances'
    case 'vehicleinspection': return 'vehicle-inspections'
    case 'tollrecord': return 'toll-tracker'
    case 'expenseapproval': return 'expense-approvals'
    case 'bordercrossing': return 'border-crossings'
    case 'depotqueue': return 'depot-queue'
    case 'roadconditionreport': return 'road-conditions'
    case 'loadboard': return 'load-board'
    case 'insuranceclaim': return 'insurance-claims'
    case 'driverincentive': return 'driver-incentives'
    case 'warehouseitem': return 'warehouse'
    case 'dvlaRegistration':
    case 'dvla': return 'dvla'
    case 'roadworthyinspection':
    case 'roadworthy': return 'roadworthy'
    case 'document': return 'documents'
    case 'user': return 'users'
    case 'report': return 'reports'
    default: return null
  }
}

// ============ List Animation Variants ============

const listVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.04,
    },
  },
}

const listItemVariants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
}

// ============ Props ============

interface ActivityFeedProps {
  onNavigate?: (page: string) => void
}

// ============ Component ============

const ACTIVITY_LIMIT_MOBILE = 5
const ACTIVITY_LIMIT_DESKTOP = 8
const DESKTOP_BREAKPOINT = 1024 // lg

export function ActivityFeed({ onNavigate }: ActivityFeedProps) {
  const [activities, setActivities] = React.useState<ActivityItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [selectedItem, setSelectedItem] = React.useState<ActivityItem | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)
  const [activityLimit, setActivityLimit] = React.useState(
    typeof window !== 'undefined' && window.innerWidth >= DESKTOP_BREAKPOINT
      ? ACTIVITY_LIMIT_DESKTOP
      : ACTIVITY_LIMIT_MOBILE
  )
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  // Responsive: adjust visible count on resize
  React.useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`)
    const handler = (e: MediaQueryListEvent) => {
      setActivityLimit(e.matches ? ACTIVITY_LIMIT_DESKTOP : ACTIVITY_LIMIT_MOBILE)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const loadActivities = React.useCallback(async () => {
    try {
      const data = await fetchActivityFeed()
      if (data) {
        setActivities(data)
        setError(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load + auto-refresh every 60 seconds
  React.useEffect(() => {
    loadActivities()
    timerRef.current = setInterval(loadActivities, 60_000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [loadActivities])

  // Open detail sheet on click
  const handleItemClick = (item: ActivityItem) => {
    setSelectedItem(item)
    setDetailOpen(true)
  }

  // Navigate to full page from detail sheet — passes entity info for row highlighting
  const handleGoToPage = (item: ActivityItem) => {
    const targetPage = resolveTargetPage(item)
    if (targetPage) {
      setDetailOpen(false)
      const navPayload = {
        page: targetPage,
        entityId: item.entityId || undefined,
        entityType: item.entityType || undefined,
      }
      if (onNavigate) {
        // Set highlight store before navigating (onNavigate is just setCurrentPage)
        if (item.entityId && item.entityType) {
          useHighlightStore.getState().setHighlight(item.entityId, item.entityType)
        }
        onNavigate(targetPage)
      } else {
        window.dispatchEvent(new CustomEvent('navigate-page', { detail: navPayload }))
      }
    }
  }

  // Parse JSON details string
  const parseDetails = (detailsStr: string | undefined): Record<string, unknown> | null => {
    if (!detailsStr) return null
    try {
      return JSON.parse(detailsStr)
    } catch { return null }
  }

  const { icon: SelectedIcon, bgColor: selectedBgColor, textColor: selectedTextColor } = selectedItem
    ? getActivityIcon(selectedItem)
    : { icon: Activity, bgColor: '', textColor: '' }

  return (
    <>
      <Card className="h-full flex flex-col overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-amber-100 dark:bg-amber-900/30 p-1.5">
              <Activity className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => { setLoading(true); loadActivities() }}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-amber-600 dark:text-amber-400"
              onClick={() => onNavigate?.('audit-logs')}
            >
              View All <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0 flex-1 min-h-0 overflow-hidden">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => { setLoading(true); loadActivities() }}
              >
                Retry
              </Button>
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No recent activity</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[480px]">
              <motion.div
                variants={listVariants}
                initial="hidden"
                animate="show"
                className="space-y-1"
              >
                {activities.slice(0, activityLimit).map((item) => {
                  const { icon: Icon, bgColor, textColor } = getActivityIcon(item)
                  return (
                    <motion.div
                      key={item.id}
                      variants={listItemVariants}
                      className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/40 cursor-pointer group transition-colors"
                      onClick={() => handleItemClick(item)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleItemClick(item)
                        }
                      }}
                    >
                      {/* Icon circle */}
                      <div className={`rounded-full p-2 shrink-0 ${bgColor}`}>
                        <Icon className={`h-4 w-4 ${textColor}`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">
                        <p className="text-sm font-medium truncate leading-tight">
                          {item.title}
                        </p>
                        {item.description && item.description !== item.title && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {item.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {timeAgo(item.timestamp)}
                          </span>
                          {item.userName && (
                            <>
                              <span className="text-xs text-muted-foreground/50">·</span>
                              <span className="text-xs text-muted-foreground">
                                {item.userName}
                              </span>
                            </>
                          )}
                          <ArrowRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-amber-600 dark:group-hover:text-amber-400 ml-auto shrink-0 transition-colors" />
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </motion.div>
              {activities.length > activityLimit && (
                <div className="pt-2 pb-1 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-amber-600"
                    onClick={() => onNavigate?.('audit-logs')}
                  >
                    +{activities.length - activityLimit} more · View All
                  </Button>
                </div>
              )}
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* ============ Activity Detail Side Sheet ============ */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader className="shrink-0 px-5 sm:px-6 pt-5 sm:pt-5">
            <SheetTitle className="flex items-center gap-2">
              <div className={`rounded-full p-1.5 shrink-0 ${selectedBgColor}`}>
                <SelectedIcon className={`h-4 w-4 ${selectedTextColor}`} />
              </div>
              Activity Details
            </SheetTitle>
            <SheetDescription className="line-clamp-2">
              {selectedItem?.title}
            </SheetDescription>
          </SheetHeader>

          {selectedItem && (
            <div className="mt-4 sm:mt-6 space-y-5 px-5 sm:px-6 overflow-y-auto flex-1 min-h-0 pb-8 sm:pb-6">
              {/* Action badge + type */}
              <div className="flex items-center gap-2">
                {selectedItem.action && (
                  <Badge variant="secondary" className={`text-xs px-2 py-0.5 ${getActionBadgeColor(selectedItem.action)}`}>
                    {selectedItem.action}
                  </Badge>
                )}
                {selectedItem.type && (
                  <Badge variant="outline" className="text-xs px-2 py-0.5 capitalize">
                    {selectedItem.type.replace('_', ' ')}
                  </Badge>
                )}
              </div>

              {/* Description */}
              {selectedItem.description && selectedItem.description !== selectedItem.title && (
                <p className="text-sm text-muted-foreground">
                  {selectedItem.description}
                </p>
              )}

              <Separator />

              {/* Metadata */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Details</h4>
                <div className="space-y-2">
                  {selectedItem.entity && (
                    <div className="flex items-center gap-3 text-sm p-2.5 rounded-lg bg-muted/50">
                      <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground min-w-[70px]">Entity</span>
                      <span className="ml-auto font-medium text-foreground truncate text-right">{selectedItem.entity}</span>
                    </div>
                  )}
                  {selectedItem.entityType && (
                    <div className="flex items-center gap-3 text-sm p-2.5 rounded-lg bg-muted/50">
                      <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground min-w-[70px]">Type</span>
                      <span className="ml-auto font-medium text-foreground capitalize">{selectedItem.entityType}</span>
                    </div>
                  )}
                  {selectedItem.entityId && (
                    <div className="flex items-center gap-3 text-sm p-2.5 rounded-lg bg-muted/50">
                      <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground min-w-[70px]">ID</span>
                      <span className="ml-auto font-mono text-xs text-foreground">{selectedItem.entityId}</span>
                    </div>
                  )}
                  {selectedItem.userName && (
                    <div className="flex items-center gap-3 text-sm p-2.5 rounded-lg bg-muted/50">
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground min-w-[70px]">User</span>
                      <span className="ml-auto font-medium text-foreground truncate text-right">{selectedItem.userName}</span>
                    </div>
                  )}
                  {selectedItem.timestamp && (
                    <div className="flex items-center gap-3 text-sm p-2.5 rounded-lg bg-muted/50">
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground min-w-[70px]">Time</span>
                      <span className="ml-auto font-medium text-foreground text-right text-xs">{formatFullDate(selectedItem.timestamp)}</span>
                    </div>
                  )}
                  {selectedItem.ipAddress && (
                    <div className="flex items-center gap-3 text-sm p-2.5 rounded-lg bg-muted/50">
                      <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground min-w-[70px]">IP</span>
                      <span className="ml-auto font-mono text-xs text-foreground">{selectedItem.ipAddress}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Change details (if audit with JSON details) */}
              {selectedItem.type === 'audit' && selectedItem.details && (() => {
                const parsed = parseDetails(selectedItem.details)
                if (!parsed || typeof parsed !== 'object') return null
                const entries = Object.entries(parsed)
                if (entries.length === 0) return null

                return (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Change Details</h4>
                      <div className="rounded-lg border overflow-hidden">
                        <div className="divide-y">
                          {entries.map(([key, value]) => (
                            <div key={key} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                              <span className="text-muted-foreground font-medium shrink-0 capitalize text-xs min-w-[90px]">{String(key).replace(/([A-Z])/g, ' $1').trim()}</span>
                              <span className="text-foreground font-mono break-all text-xs leading-relaxed">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )
              })()}

              {/* Navigate to page */}
              {resolveTargetPage(selectedItem) && (
                <>
                  <Separator />
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => handleGoToPage(selectedItem)}
                  >
                    <ExternalLink className="h-4 w-4" />
                    View in {(() => {
                      const page = resolveTargetPage(selectedItem)
                      if (!page) return ''
                      return page.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                    })()}
                  </Button>
                </>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
