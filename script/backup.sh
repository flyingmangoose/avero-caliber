#!/bin/bash
# Caliber Database Backup Script
# Usage: ./script/backup.sh [backup_dir]
# Cron: 0 */6 * * * cd /opt/erp-agent && ./script/backup.sh /data/caliber-backups

set -e

APP_DIR="${APP_DIR:-/opt/erp-agent}"
BACKUP_DIR="${1:-/data/caliber-backups}"
DB_FILE="$APP_DIR/data.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
KEEP_DAYS=30

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Check DB exists
if [ ! -f "$DB_FILE" ]; then
  echo "ERROR: Database not found at $DB_FILE"
  exit 1
fi

# Use SQLite's .backup command for a safe hot backup (handles WAL correctly)
if command -v sqlite3 &> /dev/null; then
  sqlite3 "$DB_FILE" ".backup '$BACKUP_DIR/caliber_$TIMESTAMP.db'"
  echo "Backup created: $BACKUP_DIR/caliber_$TIMESTAMP.db (sqlite3 .backup)"
else
  # Fallback: copy the file (safe with WAL mode if no active writes)
  cp "$DB_FILE" "$BACKUP_DIR/caliber_$TIMESTAMP.db"
  # Also copy WAL files if they exist
  [ -f "$DB_FILE-wal" ] && cp "$DB_FILE-wal" "$BACKUP_DIR/caliber_$TIMESTAMP.db-wal"
  [ -f "$DB_FILE-shm" ] && cp "$DB_FILE-shm" "$BACKUP_DIR/caliber_$TIMESTAMP.db-shm"
  echo "Backup created: $BACKUP_DIR/caliber_$TIMESTAMP.db (file copy)"
fi

# Compress the backup
gzip "$BACKUP_DIR/caliber_$TIMESTAMP.db"
echo "Compressed: $BACKUP_DIR/caliber_$TIMESTAMP.db.gz"

# Clean up old backups (keep last KEEP_DAYS days)
find "$BACKUP_DIR" -name "caliber_*.db.gz" -mtime +$KEEP_DAYS -delete
echo "Cleaned backups older than $KEEP_DAYS days"

# Show backup sizes
echo "Current backups:"
ls -lh "$BACKUP_DIR"/caliber_*.db.gz 2>/dev/null | tail -5
echo "Total backup size: $(du -sh "$BACKUP_DIR" | cut -f1)"
