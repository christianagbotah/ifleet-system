'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, X, CheckSquare, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface BulkActionsToolbarProps {
  selectedCount: number
  totalCount: number
  allSelected: boolean
  onSelectAll: () => void
  onDeselectAll: () => void
  onDelete: () => void
  onCancel: () => void
  isDeleting?: boolean
  /** Optional label for the entity type (e.g., "expense", "trip") */
  label?: string
}

export function BulkActionsToolbar({
  selectedCount,
  totalCount,
  allSelected,
  onSelectAll,
  onDeselectAll,
  onDelete,
  onCancel,
  isDeleting = false,
  label = 'item',
}: BulkActionsToolbarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
        >
          <div className="pointer-events-auto mb-4 mx-4">
            <div className="flex items-center gap-3 rounded-xl border bg-card/95 backdrop-blur-lg shadow-lg px-4 py-3 sm:px-5 sm:py-3">
              {/* Selection info */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-bold">
                  {selectedCount}
                </span>
                <span className="text-sm font-medium whitespace-nowrap">
                  {allSelected ? 'All' : ''} {selectedCount} {label}{selectedCount !== 1 ? 's' : ''} selected
                </span>
              </div>

              <div className="h-6 w-px bg-border shrink-0" />

              {/* Select all / Deselect all */}
              {allSelected ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDeselectAll}
                  className="gap-1.5 text-xs shrink-0"
                >
                  <Square className="h-3.5 w-3.5" />
                  Deselect all
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSelectAll}
                  className="gap-1.5 text-xs shrink-0"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  Select all ({totalCount})
                </Button>
              )}

              <div className="h-6 w-px bg-border shrink-0" />

              {/* Delete */}
              <Button
                variant="destructive"
                size="sm"
                onClick={onDelete}
                disabled={isDeleting}
                className="gap-1.5 text-xs shrink-0"
              >
                <Trash2 className={cn('h-3.5 w-3.5', isDeleting && 'animate-pulse')} />
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>

              {/* Cancel */}
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancel}
                className="gap-1.5 text-xs shrink-0"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
