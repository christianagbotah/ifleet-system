'use client'

import * as React from 'react'
import { useAuthStore } from '@/lib/store/auth'

interface TruckBasic {
  id: string
  plateNumber: string
  make: string
  model: string
}

interface UseDriverTruckReturn {
  isDriver: boolean
  driverId: string | null
  assignedTruckId: string | null
  truck: TruckBasic | null
  loading: boolean
}

export function useDriverTruck(): UseDriverTruckReturn {
  const user = useAuthStore((s) => s.user)
  const isDriver = user?.role === 'Driver'
  const driverId = isDriver && user?.driverId ? user.driverId : null

  const [truck, setTruck] = React.useState<TruckBasic | null>(null)
  const [loading, setLoading] = React.useState(!!isDriver)

  React.useEffect(() => {
    if (!driverId) {
      setTruck(null)
      setLoading(false)
      return
    }
    setLoading(true)
    fetch(`/api/trucks?driverId=${driverId}&status=active&limit=1`)
      .then((res) => res.json())
      .then((data) => {
        if (data.data && data.data.length > 0) {
          const t = data.data[0]
          setTruck({ id: t.id, plateNumber: t.plateNumber, make: t.make, model: t.model })
        } else {
          setTruck(null)
        }
      })
      .catch(() => setTruck(null))
      .finally(() => setLoading(false))
  }, [driverId])

  return {
    isDriver,
    driverId,
    assignedTruckId: truck?.id ?? null,
    truck,
    loading,
  }
}
