"use client"

import * as React from "react"
import { SlidersHorizontalIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

interface ColumnVisibilityMenuProps {
  columns: { key: string; label: string; visible: boolean }[]
  onToggle: (key: string) => void
  className?: string
}

function ColumnVisibilityMenu({
  columns,
  onToggle,
  className,
}: ColumnVisibilityMenuProps) {
  const visibleCount = columns.filter((c) => c.visible).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-2", className)}
          aria-label={`Toggle columns. ${visibleCount} of ${columns.length} visible`}
        >
          <SlidersHorizontalIcon className="size-4" />
          <span className="hidden sm:inline">Columns</span>
          {visibleCount < columns.length && (
            <span className="bg-primary text-primary-foreground ml-1 flex size-5 items-center justify-center rounded-full text-[10px] font-bold">
              {visibleCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Toggle columns ({visibleCount}/{columns.length})
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.key}
            checked={column.visible}
            onCheckedChange={() => onToggle(column.key)}
            className="cursor-pointer"
            onSelect={(e) => e.preventDefault()}
          >
            {column.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { ColumnVisibilityMenu, type ColumnVisibilityMenuProps }
