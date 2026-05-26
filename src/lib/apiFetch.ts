'use client'

import { useLoadingStore } from '@/lib/store/loading'
import { toast } from 'sonner'

interface ApiFetchOptions extends RequestInit {
  skipLoading?: boolean
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { skipLoading, ...fetchOptions } = options
  const method = (fetchOptions.method || 'GET').toUpperCase()
  const isMutating = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)

  if (isMutating && !skipLoading) {
    useLoadingStore.getState().startLoading()
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((fetchOptions.headers as Record<string, string>) || {}),
    }

    const res = await fetch(path, {
      ...fetchOptions,
      headers,
    })

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || `Request failed: ${res.status}`)
    }

    return data as T
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'An unexpected error occurred'
    toast.error(message)
    throw error
  } finally {
    if (isMutating && !skipLoading) {
      useLoadingStore.getState().stopLoading()
    }
  }
}
