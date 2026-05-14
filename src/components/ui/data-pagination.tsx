"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface DataPaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  className?: string
}

/**
 * Generates an array of page numbers with ellipsis placeholders.
 * Algorithm: always show first, last, current ± 1, and fill gaps with -1 (ellipsis).
 */
function generatePages(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages: (number | "ellipsis")[] = [1]

  if (current > 3) {
    pages.push("ellipsis")
  }

  const rangeStart = Math.max(2, current - 1)
  const rangeEnd = Math.min(total - 1, current + 1)

  for (let i = rangeStart; i <= rangeEnd; i++) {
    pages.push(i)
  }

  if (current < total - 2) {
    pages.push("ellipsis")
  }

  if (total > 1) {
    pages.push(total)
  }

  return pages
}

function DataPagination({
  currentPage,
  totalPages,
  onPageChange,
  className,
}: DataPaginationProps) {
  const pages = generatePages(currentPage, totalPages)

  return (
    <nav
      role="navigation"
      aria-label="Pagination"
      className={cn("flex items-center justify-center gap-1", className)}
    >
      {/* Previous */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        aria-label="Previous page"
        className="gap-1"
      >
        <ChevronLeftIcon className="size-4" />
        <span className="hidden sm:inline">Previous</span>
      </Button>

      {/* Page numbers */}
      <div className="hidden items-center gap-1 sm:flex">
        {pages.map((page, index) =>
          page === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              className="flex size-8 items-center justify-center text-muted-foreground"
              aria-hidden
            >
              <MoreHorizontalIcon className="size-4" />
            </span>
          ) : (
            <Button
              key={page}
              variant={page === currentPage ? "default" : "outline"}
              size="sm"
              onClick={() => onPageChange(page)}
              aria-label={`Page ${page}`}
              aria-current={page === currentPage ? "page" : undefined}
              className="min-w-8"
            >
              {page}
            </Button>
          )
        )}
      </div>

      {/* Mobile: just show "Page X of Y" */}
      <span className="text-muted-foreground px-2 text-sm sm:hidden">
        {currentPage} / {totalPages}
      </span>

      {/* Desktop: "Page X of Y" text */}
      <span className="text-muted-foreground hidden px-3 text-sm md:inline">
        Page {currentPage} of {totalPages}
      </span>

      {/* Next */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        aria-label="Next page"
        className="gap-1"
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRightIcon className="size-4" />
      </Button>
    </nav>
  )
}

export { DataPagination, type DataPaginationProps }
