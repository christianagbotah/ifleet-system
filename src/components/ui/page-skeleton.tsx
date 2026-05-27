"use client"

import { Skeleton } from "@/components/ui/skeleton"

interface PageSkeletonProps {
  statsCount?: number
  filterRow?: boolean
  tableRows?: number
}

export function PageSkeleton({
  statsCount = 3,
  filterRow = true,
  tableRows = 5,
}: PageSkeletonProps) {
  return (
    <div className="space-y-6 animate-in fade-in-0 duration-500">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: statsCount }).map((_, i) => (
          <div
            key={`stat-${i}`}
            className="rounded-xl border bg-card p-6 space-y-3"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="size-8 rounded-md" />
            </div>
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      {filterRow && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-40" />
          <div className="flex-1" />
          <Skeleton className="h-9 w-28" />
        </div>
      )}

      {/* Table Skeleton */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {/* Table Header */}
        <div className="border-b px-6 py-3">
          <div className="flex items-center gap-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <div className="flex-1" />
            <Skeleton className="h-4 w-10" />
          </div>
        </div>

        {/* Table Rows */}
        <div className="divide-y">
          {Array.from({ length: tableRows }).map((_, i) => (
            <div
              key={`row-${i}`}
              className="flex items-center gap-4 px-6 py-4"
            >
              <Skeleton className="h-4 w-4 shrink-0" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-20" />
              <div className="flex-1" />
              <Skeleton className="size-7 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
