'use client'

import { useCallback, useRef } from 'react'
import { toast } from '@/lib/toast-config'
import { useQueryClient } from '@tanstack/react-query'

interface UseUndoDeleteOptions<T> {
  entityName: string
  queryKey: string[]
  createFn: (data: T) => Promise<void>
}

export function useUndoDelete<T>({
  entityName,
  queryKey,
  createFn,
}: UseUndoDeleteOptions<T>) {
  const queryClient = useQueryClient()
  const deletedItemRef = useRef<T | null>(null)

  const executeWithUndo = useCallback(
    async (item: T) => {
      deletedItemRef.current = item

      toast.success(`${entityName} deleted successfully`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            if (deletedItemRef.current) {
              try {
                await createFn(deletedItemRef.current)
                queryClient.invalidateQueries({ queryKey })
                deletedItemRef.current = null
                toast.success('Action undone')
              } catch {
                toast.error(`Failed to undo ${entityName.toLowerCase()} deletion`)
              }
            }
          },
        },
        duration: 5000,
      })
    },
    [entityName, queryKey, createFn, queryClient]
  )

  return { executeWithUndo }
}
