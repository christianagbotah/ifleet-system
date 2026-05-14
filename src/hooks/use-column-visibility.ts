'use client'

import { useState, useCallback, useMemo } from 'react'

interface ColumnDef {
  key: string
  label: string
  defaultVisible: boolean
  group?: string
}

interface UseColumnVisibilityReturn {
  visibleColumns: string[]
  toggleColumn: (key: string) => void
  isColumnVisible: (key: string) => boolean
  showAll: () => void
  hideAll: () => void
  columnCount: number
  columns: ColumnDef[]
  groupedColumns: Record<string, ColumnDef[]>
}

function loadInitialPreferences(storageKey: string): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const stored = localStorage.getItem(storageKey)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

export function useColumnVisibility(
  tableName: string,
  columnDefs: ColumnDef[]
): UseColumnVisibilityReturn {
  const storageKey = `ifleetpro-${tableName}-columns`

  const [preferences, setPreferences] = useState<Record<string, boolean>>(() =>
    loadInitialPreferences(storageKey)
  )

  const visibleColumns = useMemo(() => {
    return columnDefs
      .filter((col) => {
        if (col.key in preferences) return preferences[col.key]
        return col.defaultVisible
      })
      .map((col) => col.key)
  }, [columnDefs, preferences])

  const isColumnVisible = useCallback((key: string): boolean => {
    if (key in preferences) return preferences[key]
    const col = columnDefs.find((c) => c.key === key)
    return col ? col.defaultVisible : false
  }, [preferences, columnDefs])

  const toggleColumn = useCallback((key: string) => {
    setPreferences((prev) => {
      const next = { ...prev, [key]: !prev[key as string] }
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify(next))
      }
      return next
    })
  }, [storageKey])

  const showAll = useCallback(() => {
    const allVisible: Record<string, boolean> = {}
    columnDefs.forEach((col) => { allVisible[col.key] = true })
    setPreferences(allVisible)
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify(allVisible))
    }
  }, [columnDefs, storageKey])

  const hideAll = useCallback(() => {
    const allHidden: Record<string, boolean> = {}
    columnDefs.forEach((col) => { allHidden[col.key] = false })
    setPreferences(allHidden)
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify(allHidden))
    }
  }, [columnDefs, storageKey])

  const groupedColumns = useMemo(() => {
    const groups: Record<string, ColumnDef[]> = {}
    columnDefs.forEach((col) => {
      const group = col.group || 'General'
      if (!groups[group]) groups[group] = []
      groups[group].push(col)
    })
    return groups
  }, [columnDefs])

  return {
    visibleColumns,
    toggleColumn,
    isColumnVisible,
    showAll,
    hideAll,
    columnCount: visibleColumns.length,
    columns: columnDefs,
    groupedColumns,
  }
}
