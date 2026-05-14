"use client"

import { motion } from "framer-motion"
import { ArrowDownIcon, ArrowUpIcon, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"

interface StatsCardProps {
  icon: LucideIcon
  title: string
  value: string
  change?: number
  changeLabel?: string
  className?: string
}

export function StatsCard({
  icon: Icon,
  title,
  value,
  change,
  changeLabel,
  className,
}: StatsCardProps) {
  const isPositive = change !== undefined && change >= 0
  const isNegative = change !== undefined && change < 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <Card className={cn("gap-0 py-0", className)}>
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-muted-foreground">
              {title}
            </span>
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
              <Icon className="size-4.5 text-muted-foreground" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-2xl font-bold tracking-tight">{value}</span>

            {change !== undefined && (
              <div className="flex items-center gap-1.5 text-xs">
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium",
                    isPositive && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                    isNegative && "bg-red-500/10 text-red-700 dark:text-red-400"
                  )}
                >
                  {isPositive ? (
                    <ArrowUpIcon className="size-3" />
                  ) : (
                    <ArrowDownIcon className="size-3" />
                  )}
                  {Math.abs(change).toFixed(1)}%
                </span>
                {changeLabel && (
                  <span className="text-muted-foreground">{changeLabel}</span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
