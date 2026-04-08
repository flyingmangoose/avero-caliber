#!/bin/bash
# Caliber Droplet Setup Script
# Run once on a fresh droplet or after major updates
# Usage: cd /opt/erp-agent && ./script/setup-droplet.sh

set -e

APP_DIR="/opt/erp-agent"
echo "=== Caliber Droplet Setup ==="

# 1. Install PM2 globally if not present
if ! command -v pm2 &> /dev/null; then
  echo "Installing PM2..."
  npm install -g pm2
else
  echo "PM2 already installed: $(pm2 --version)"
fi

# 2. Create .env file if it doesn't exist
if [ ! -f "$APP_DIR/.env" ]; then
  echo "Creating .env template..."
  cat > "$APP_DIR/.env" << 'ENVEOF'
# Caliber Environment Configuration
# Edit this file with your actual values

# AI Provider (required for document analysis & synthesis)
XAI_API_KEY=

# Google OAuth (optional — app works without auth if not set)
# Get credentials at: https://console.cloud.google.com/apis/credentials
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Session secret (generate with: openssl rand -hex 32)
SESSION_SECRET=
ENVEOF
  echo "IMPORTANT: Edit $APP_DIR/.env with your API keys"
  echo "  nano $APP_DIR/.env"
else
  echo ".env already exists"
fi

# 3. Create backup directory
mkdir -p /data/caliber-backups
echo "Backup directory: /data/caliber-backups"

# 4. Create log directory
mkdir -p /var/log
echo "Log directory: /var/log"

# 5. Create users table if needed
if command -v sqlite3 &> /dev/null; then
  sqlite3 "$APP_DIR/data.db" "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, google_id TEXT NOT NULL UNIQUE, email TEXT NOT NULL, name TEXT NOT NULL, picture TEXT, role TEXT DEFAULT 'viewer', is_active INTEGER DEFAULT 1, last_login_at TEXT, created_at TEXT NOT NULL);"
  sqlite3 "$APP_DIR/data.db" "CREATE TABLE IF NOT EXISTS assessment_history (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, domain TEXT NOT NULL, previous_rating TEXT NOT NULL, new_rating TEXT NOT NULL, changed_by TEXT, created_at TEXT NOT NULL);"
  sqlite3 "$APP_DIR/data.db" "CREATE TABLE IF NOT EXISTS project_baselines (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, contracted_amount INTEGER, go_live_date TEXT, contract_start_date TEXT, scope_items TEXT, key_milestones TEXT, vendor_name TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT);"
  echo "Database tables verified"
fi

# 6. Stop any existing node process
pkill -f "node /opt/erp-agent/dist/index.cjs" 2>/dev/null || true
pm2 delete caliber 2>/dev/null || true

# 7. Start with PM2
cd "$APP_DIR"
pm2 start ecosystem.config.js
pm2 save

# 8. Set up PM2 startup (auto-start on reboot)
pm2 startup systemd -u root --hp /root 2>/dev/null || pm2 startup

# 9. Set up backup cron if not already present
if ! crontab -l 2>/dev/null | grep -q "caliber-backups"; then
  (crontab -l 2>/dev/null; echo "0 */6 * * * cd /opt/erp-agent && ./script/backup.sh /data/caliber-backups >> /var/log/caliber-backup.log 2>&1") | crontab -
  echo "Backup cron installed (every 6 hours)"
else
  echo "Backup cron already installed"
fi

echo ""
echo "=== Setup Complete ==="
echo "App status: $(pm2 status caliber --no-color 2>/dev/null | grep caliber || echo 'check pm2 status')"
echo ""
echo "Useful commands:"
echo "  pm2 status          — check app status"
echo "  pm2 logs caliber    — view logs"
echo "  pm2 restart caliber — restart app"
echo "  nano .env           — edit environment variables"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your XAI_API_KEY"
echo "  2. pm2 restart caliber"
echo "  3. (Optional) Add GOOGLE_CLIENT_ID/SECRET for auth"
