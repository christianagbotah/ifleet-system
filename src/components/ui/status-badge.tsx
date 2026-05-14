"use client"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

type StatusVariant =
  | "trip"
  | "driver"
  | "truck"
  | "expense"
  | "maintenance"
  | "default"

interface StatusConfig {
  /** Tailwind background color classes */
  bg: string
  /** Tailwind text color classes */
  text: string
  /** Dot indicator background color */
  dot: string
}

const statusMap: Record<StatusVariant, Record<string, StatusConfig>> = {
  trip: {
    pending: {
      bg: "bg-amber-500/10 border-amber-500/20",
      text: "text-amber-700 dark:text-amber-400",
      dot: "bg-amber-500",
    },
    in_progress: {
      bg: "bg-blue-500/10 border-blue-500/20",
      text: "text-blue-700 dark:text-blue-400",
      dot: "bg-blue-500",
    },
    delivered: {
      bg: "bg-emerald-500/10 border-emerald-500/20",
      text: "text-emerald-700 dark:text-emerald-400",
      dot: "bg-emerald-500",
    },
    cancelled: {
      bg: "bg-red-500/10 border-red-500/20",
      text: "text-red-700 dark:text-red-400",
      dot: "bg-red-500",
    },
    completed: {
      bg: "bg-emerald-500/10 border-emerald-500/20",
      text: "text-emerald-700 dark:text-emerald-400",
      dot: "bg-emerald-500",
    },
  },
  driver: {
    active: {
      bg: "bg-emerald-500/10 border-emerald-500/20",
      text: "text-emerald-700 dark:text-emerald-400",
      dot: "bg-emerald-500",
    },
    inactive: {
      bg: "bg-muted border-muted-foreground/10",
      text: "text-muted-foreground",
      dot: "bg-muted-foreground",
    },
    suspended: {
      bg: "bg-red-500/10 border-red-500/20",
      text: "text-red-700 dark:text-red-400",
      dot: "bg-red-500",
    },
  },
  truck: {
    active: {
      bg: "bg-emerald-500/10 border-emerald-500/20",
      text: "text-emerald-700 dark:text-emerald-400",
      dot: "bg-emerald-500",
    },
    inactive: {
      bg: "bg-muted border-muted-foreground/10",
      text: "text-muted-foreground",
      dot: "bg-muted-foreground",
    },
    maintenance: {
      bg: "bg-amber-500/10 border-amber-500/20",
      text: "text-amber-700 dark:text-amber-400",
      dot: "bg-amber-500",
    },
    decommissioned: {
      bg: "bg-red-500/10 border-red-500/20",
      text: "text-red-700 dark:text-red-400",
      dot: "bg-red-500",
    },
  },
  expense: {
    pending: {
      bg: "bg-amber-500/10 border-amber-500/20",
      text: "text-amber-700 dark:text-amber-400",
      dot: "bg-amber-500",
    },
    approved: {
      bg: "bg-emerald-500/10 border-emerald-500/20",
      text: "text-emerald-700 dark:text-emerald-400",
      dot: "bg-emerald-500",
    },
    rejected: {
      bg: "bg-red-500/10 border-red-500/20",
      text: "text-red-700 dark:text-red-400",
      dot: "bg-red-500",
    },
  },
  maintenance: {
    pending: {
      bg: "bg-amber-500/10 border-amber-500/20",
      text: "text-amber-700 dark:text-amber-400",
      dot: "bg-amber-500",
    },
    in_progress: {
      bg: "bg-blue-500/10 border-blue-500/20",
      text: "text-blue-700 dark:text-blue-400",
      dot: "bg-blue-500",
    },
    completed: {
      bg: "bg-emerald-500/10 border-emerald-500/20",
      text: "text-emerald-700 dark:text-emerald-400",
      dot: "bg-emerald-500",
    },
    overdue: {
      bg: "bg-red-500/10 border-red-500/20",
      text: "text-red-700 dark:text-red-400",
      dot: "bg-red-500",
    },
  },
  default: {
    default: {
      bg: "bg-muted border-muted-foreground/10",
      text: "text-muted-foreground",
      dot: "bg-muted-foreground",
    },
  },
}

/** Normalise a raw status string into a snake_case key for lookup */
function toStatusKey(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_")
}

/** Format "snake_case" or "in_progress" into "In Progress" for display */
function formatStatusLabel(key: string): string {
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

interface StatusBadgeProps {
  status: string
  variant?: StatusVariant
}

export function StatusBadge({ status, variant = "default" }: StatusBadgeProps) {
  const key = toStatusKey(status)
  const variantConfig = statusMap[variant] ?? statusMap.default
  const config = variantConfig[key] ?? statusMap.default.default

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium", config.bg, config.text)}
    >
      <span className={cn("size-1.5 rounded-full", config.dot)} />
      {formatStatusLabel(key)}
    </Badge>
  )
}
