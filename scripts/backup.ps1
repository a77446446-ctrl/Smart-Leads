# Backup script for MAKS-LEAD-HUB Postgres Database (Windows PowerShell)

$envFile = "../.env"
if (-not (Test-Path $envFile)) {
    $envFile = ".env"
}

if (Test-Path $envFile) {
    Get-Content $envFile | Where-Object { $_ -match '^[^#]' } | ForEach-Object {
        $name, $value = $_ -split '=', 2
        [Environment]::SetEnvironmentVariable($name, $value)
    }
}

$dbUrl = [Environment]::GetEnvironmentVariable("DATABASE_URL")
if ([string]::IsNullOrWhiteSpace($dbUrl)) {
    Write-Host "Error: DATABASE_URL is not set in .env" -ForegroundColor Red
    exit 1
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = "backups"
$backupFile = "$backupDir\db_backup_$timestamp.sql"

if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

Write-Host "Starting backup of database..." -ForegroundColor Cyan
pg_dump $dbUrl -F p -f $backupFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "Backup successfully saved to $backupFile" -ForegroundColor Green
} else {
    Write-Host "Backup failed! Do you have pg_dump installed?" -ForegroundColor Red
    exit 1
}
