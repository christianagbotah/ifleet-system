const FINALIZABLE_TRIP_STATUSES = new Set([
  'postload_weighing',
  'awaiting_dispatch_clearance',
  'exception_hold',
])

export function assertWaybillFinalizableStatus(status: string): void {
  if (!FINALIZABLE_TRIP_STATUSES.has(status)) {
    throw new Error(`Electronic waybill cannot be finalized while trip is ${status}`)
  }
}

export function isWaybillWriteConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false
  const code = (error as { code?: unknown }).code
  return code === 'P2002' || code === 'P2034'
}
