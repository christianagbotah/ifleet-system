const DEFAULT_TRACKING_SOCKET_PORT = 3033

export function resolveTrackingSocketPort(value: string | undefined = process.env.NEXT_PUBLIC_TRACKING_SOCKET_PORT): number {
  if (!value) return DEFAULT_TRACKING_SOCKET_PORT
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return DEFAULT_TRACKING_SOCKET_PORT
  return port
}

export function trackingSocketEndpoint(value: string | undefined = process.env.NEXT_PUBLIC_TRACKING_SOCKET_PORT): string {
  return `/?XTransformPort=${resolveTrackingSocketPort(value)}`
}
