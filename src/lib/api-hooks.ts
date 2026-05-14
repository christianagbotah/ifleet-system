import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/lib/toast-config'

export function useFetch<T>(key: string[], url: string) {
  return useQuery<T>({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch data')
      return res.json()
    },
  })
}

export function useCreate(url: string, key: string[]) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key })
      toast.success('Created successfully')
    },
    onError: (err) => toast.error(err.message),
  })
}

export function useUpdate(url: string, key: string[]) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const res = await fetch(`${url}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key })
      toast.success('Updated successfully')
    },
    onError: (err) => toast.error(err.message),
  })
}

export function useDelete(url: string, key: string[]) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${url}/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key })
      toast.success('Deleted successfully')
    },
    onError: (err) => toast.error(err.message),
  })
}

export function useAction(url: string, key: string[], label: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const res = await fetch(`${url}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Failed to ${label}`)
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key })
      toast.success(`${label.charAt(0).toUpperCase() + label.slice(1)} successfully`)
    },
    onError: (err) => toast.error(err.message),
  })
}
