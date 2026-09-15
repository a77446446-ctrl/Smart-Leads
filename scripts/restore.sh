#!/bin/bash
# Restore script for MAKS-LEAD-HUB Postgres Database
# Usage: ./restore.sh <path_to_backup.sql>

if [ -z "$1" ]; then
  echo "Usage: ./restore.sh <path_to_backup.sql>"
  exit 1
fi

BACKUP_FILE=$1

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: File $BACKUP_FILE does not exist"
  exit 1
fi

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

echo "WARNING: This will overwrite the current database data."
read -p "Are you sure you want to proceed? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
  echo "Restoring database from $BACKUP_FILE..."
  psql "$DATABASE_URL" -f "$BACKUP_FILE"
  
  if [ $? -eq 0 ]; then
    echo "Restore completed successfully!"
  else
    echo "Restore encountered errors."
    exit 1
  fi
else
  echo "Restore cancelled."
fi
