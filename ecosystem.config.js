// ══════════════════════════════════════════════════════════════
// PM2 Ecosystem Configuration — iFleetPro
// ══════════════════════════════════════════════════════════════
//
// Usage:
//   pm2 start ecosystem.config.js
//   pm2 stop all
//   pm2 restart all
//   pm2 logs ifleetpro
//   pm2 monit
//
// Auto-restart on server reboot:
//   pm2 startup
//   pm2 save
// ══════════════════════════════════════════════════════════════

module.exports = {
  apps: [
    // ── Main Next.js Application (port 3000) ──
    {
      name: 'ifleetpro',
      script: '.next/standalone/server.js',
      cwd: '/home/ifleetpro/app',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: '/home/ifleetpro/logs/ifleetpro-error.log',
      out_file: '/home/ifleetpro/logs/ifleetpro-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },

    // ── Tracking Service (port 3003) ──
    {
      name: 'ifleetpro-tracking',
      script: 'index.ts',
      cwd: '/home/ifleetpro/app/mini-services/tracking-service',
      interpreter: 'bun',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: '/home/ifleetpro/logs/tracking-error.log',
      out_file: '/home/ifleetpro/logs/tracking-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },

    // ── Notification Service (port 3004) ──
    {
      name: 'ifleetpro-notifications',
      script: 'index.ts',
      cwd: '/home/ifleetpro/app/mini-services/notification-service',
      interpreter: 'bun',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: '/home/ifleetpro/logs/notification-error.log',
      out_file: '/home/ifleetpro/logs/notification-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
