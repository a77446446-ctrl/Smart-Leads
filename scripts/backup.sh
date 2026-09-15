#!/bin/bash
# Backup script for MAKS-LEAD-HUB Postgres Database
# Usage: ./backup.sh

# Load environment variables from .env
if [ -f ../.env ]; then
  export $(grep -v '^#' ../.env | xargs)
elif [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL is not set in .env"
  exit 1
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="backups"
BACKUP_FILE="$BACKUP_DIR/db_backup_$TIMESTAMP.sql"

mkdir -p "$BACKUP_DIR"

echo "Starting backup of database..."
pg_dump "$DATABASE_URL" -F p -f "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  echo "Backup successfully saved to $BACKUP_FILE"
  # Optional: Keep only last 7 backups
  ls -tp "$BACKUP_DIR" | grep -v '/$' | tail -n +8 | xargs -I {} rm -- "$BACKUP_DIR/{}" 2>/dev/null
else
  echo "Backup failed!"
  exit 1
fi
