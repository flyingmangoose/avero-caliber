module.exports = {
  apps: [{
    name: 'caliber',
    script: 'dist/index.cjs',
    cwd: '/opt/erp-agent',
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
    },
    // Env vars loaded from /opt/erp-agent/.env at runtime
    // Create .env with: XAI_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET
    node_args: '--env-file=.env',
    // Auto-restart on crash
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
    // Watch for crashes
    max_memory_restart: '512M',
    // Logs
    error_file: '/var/log/caliber-error.log',
    out_file: '/var/log/caliber-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
};
