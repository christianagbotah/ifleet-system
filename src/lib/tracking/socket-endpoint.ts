const TRACKING_SOCKET_PATH = '/tracking-socket/socket.io'

/** Same-origin Socket.IO endpoint. Nginx owns the public proxy to the private tracking service. */
export function trackingSocketEndpoint(): string {
  return '/'
}

export function trackingSocketPath(): string {
  return TRACKING_SOCKET_PATH
}
