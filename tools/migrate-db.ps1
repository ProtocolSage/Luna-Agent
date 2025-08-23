# tools/migrate-db.ps1
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Write-Host "[migrate-db] Stopping node/electron if running..."
Get-Process node,electron -ErrorAction SilentlyContinue | Stop-Process -Force

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $root "..")

if (-not (Test-Path .\tools)) { New-Item -ItemType Directory -Force -Path .\tools | Out-Null }

# Ensure the migrator exists (you can skip this if you already placed the .cjs file)
# Set-Content .\tools\migrate-db.cjs "<PASTE THE JS HERE IF YOU WANT AUTO-CREATE>"

Write-Host "[migrate-db] Running migrator..."
node .\tools\migrate-db.cjs