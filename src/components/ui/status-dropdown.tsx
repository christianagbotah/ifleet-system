"use client"

import * as React from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface StatusDropdownProps {
  value: string
  onValueChange: (value: string) => void
  options: { value: string; label: string }[]
  className?: string
}

/**
 * Deterministic color map for status values.
 * Assigns a consistent color dot to each unique status string.
 */
const statusColorMap: Record<string, string> = {
  // Common fleet statuses
  active: "bg-emerald-500",
  completed: "bg-emerald-500",
  delivered: "bg-emerald-500",
  success: "bg-emerald-500",
  confirmed: "bg-emerald-500",
  available: "bg-emerald-500",

  in_progress: "bg-amber-500",
  "in-transit": "bg-amber-500",
  in_transit: "bg-amber-500",
  pending: "bg-amber-500",
  processing: "bg-amber-500",
  scheduled: "bg-amber-500",
  assigned: "bg-amber-500",

  delayed: "bg-orange-500",
  warning: "bg-orange-500",

  cancelled: "bg-red-500",
  failed: "bg-red-500",
  rejected: "bg-red-500",
  inactive: "bg-red-500",
  maintenance: "bg-red-500",

  draft: "bg-zinc-400",
  planned: "bg-sky-500",
  on_hold: "bg-zinc-400",
}

// Fallback colors for unknown statuses
const fallbackColors = [
  "bg-violet-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-lime-500",
  "bg-fuchsia-500",
]

function getStatusColor(statusValue: string): string {
  const normalized = statusValue.toLowerCase().replace(/\s+/g, "_")
  if (statusColorMap[normalized]) {
    return statusColorMap[normalized]!
  }
  // Fallback: deterministic from string hash
  let hash = 0
  for (let i = 0; i < statusValue.length; i++) {
    hash = (hash << 5) - hash + statusValue.charCodeAt(i)
    hash |= 0
  }
  return fallbackColors[Math.abs(hash) % fallbackColors.length]!
}

function StatusDropdown({
  value,
  onValueChange,
  options,
  className,
}: StatusDropdownProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={cn("w-full min-w-[140px]", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => {
          const dotColor = getStatusColor(option.value)
          return (
            <SelectItem key={option.value} value={option.value}>
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-block size-2 shrink-0 rounded-full",
                    dotColor
                  )}
                  aria-hidden
                />
                {option.label}
              </span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}

export { StatusDropdown, type StatusDropdownProps, getStatusColor }
