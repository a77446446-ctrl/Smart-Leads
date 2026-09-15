# Restore script for MAKS-LEAD-HUB Postgres Database (Windows PowerShell)

param (
    [Parameter(Mandatory=$true, HelpMessage="Path to the backup SQL file")]
    [string]$BackupFile
)

if (-not (Test-Path $BackupFile)) {
    Write-Host "Error: File $BackupFile does not exist" -ForegroundColor Red
    exit 1
}

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

Write-Host "WARNING: This will overwrite the current database data." -ForegroundColor Yellow
$confirmation = Read-Host "Are you sure you want to proceed? (y/n)"

if ($confirmation -match '^[Yy]$') {
    Write-Host "Restoring database from $BackupFile..." -ForegroundColor Cyan
    psql $dbUrl -f $BackupFile
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Restore completed successfully!" -ForegroundColor Green
    } else {
        Write-Host "Restore encountered errors." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Restore cancelled." -ForegroundColor Yellow
}
