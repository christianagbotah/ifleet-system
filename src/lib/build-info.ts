import packageJson from '../../package.json'

export const APP_VERSION = packageJson.version
export const APP_BUILD = process.env.NEXT_PUBLIC_BUILD_SHA?.trim()?.slice(0, 12) || 'Not exposed'
export const APP_ENVIRONMENT = process.env.NODE_ENV === 'production'
  ? 'Production'
  : process.env.NODE_ENV === 'test'
    ? 'Test'
    : 'Development'
