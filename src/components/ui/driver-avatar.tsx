"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

const sizeClasses: Record<DriverAvatarProps["size"], string> = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
  xl: "size-16 text-lg",
}

/**
 * Deterministic color palette for avatar backgrounds.
 * Produces a consistent color for any given name.
 */
const avatarColors = [
  "bg-rose-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-cyan-500",
  "bg-violet-500",
  "bg-pink-500",
  "bg-orange-500",
  "bg-teal-500",
  "bg-lime-600",
  "bg-fuchsia-500",
  "bg-red-500",
  "bg-yellow-500",
  "bg-green-500",
  "bg-sky-500",
  "bg-purple-500",
  "bg-indigo-500",
]

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase()

  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase()
}

function hashName(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    const char = name.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0 // Convert to 32-bit integer
  }
  return Math.abs(hash)
}

interface DriverAvatarProps {
  /** Full name of the driver. Initials are derived from this. */
  name: string
  /** Visual size of the avatar. */
  size?: "xs" | "sm" | "md" | "lg" | "xl"
  className?: string
}

function DriverAvatar({ name, size = "md", className }: DriverAvatarProps) {
  const initials = getInitials(name)
  const colorIndex = hashName(name) % avatarColors.length
  const bgColor = avatarColors[colorIndex]

  return (
    <div
      role="img"
      aria-label={name}
      title={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none",
        bgColor,
        sizeClasses[size],
        className
      )}
    >
      {initials}
    </div>
  )
}

export { DriverAvatar, type DriverAvatarProps }
