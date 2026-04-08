// PM2 loads env vars from this file.
// To update credentials: edit this file on the droplet at /opt/erp-agent/ecosystem.config.js
// Then run: pm2 restart caliber --update-env

module.exports = {
  apps: [{
    name: 'caliber',
    script: 'dist/index.cjs',
    cwd: '/opt/erp-agent',
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
      XAI_API_KEY: process.env.XAI_API_KEY || '',
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
      SESSION_SECRET: process.env.SESSION_SECRET || '',
    },
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
    max_memory_restart: '512M',
    error_file: '/var/log/caliber-error.log',
    out_file: '/var/log/caliber-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
};
