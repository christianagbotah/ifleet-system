import { useState, useCallback } from 'react'

export function useBulkSelect<T extends { id: string }>() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const toggleOne = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback((items: T[]) => {
    setSelectedIds(prev => {
      if (prev.size === items.length && items.every(i => prev.has(i.id))) {
        return new Set() // deselect all
      }
      return new Set(items.map(i => i.id)) // select all
    })
  }, [])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])
  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds])
  const selectedCount = selectedIds.size
  const isAllSelected = (items: T[]) => items.length > 0 && items.every(i => selectedIds.has(i.id))

  return { selectedIds, toggleOne, toggleAll, clearSelection, isSelected, selectedCount, isAllSelected }
}
