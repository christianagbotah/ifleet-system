export function canDemoAccessApi(_pathname: string, _method: string): boolean {
  // Public demo sessions are intentionally isolated from production APIs.
  // The demo workspace renders only runtime profile metadata and permission domains.
  return false
}
