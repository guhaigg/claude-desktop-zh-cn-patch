param(
  [string]$BackupDir
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Administrator privileges are required. Right-click PowerShell and choose 'Run as administrator', then run restore.ps1 again."
  }
}

function Get-RepoRoot {
  if ($PSScriptRoot) { return $PSScriptRoot }
  return (Get-Location).Path
}

Assert-Admin

$repoRoot = Get-RepoRoot
if (-not $BackupDir) {
  $BackupDir = Get-ChildItem -LiteralPath (Join-Path $repoRoot "backups") -Directory -Filter "claude-desktop-language.*" -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    Select-Object -First 1 -ExpandProperty FullName
}

if (-not $BackupDir -or -not (Test-Path -LiteralPath $BackupDir)) {
  throw "Backup directory not found."
}

$manifestPath = Join-Path $BackupDir "restore-manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "Restore manifest not found: $manifestPath"
}

taskkill.exe /IM Claude.exe /F 2>$null | Out-Null
Start-Sleep -Seconds 1

$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
foreach ($entry in $manifest) {
  $backupPath = Join-Path $BackupDir $entry.backup
  if (-not (Test-Path -LiteralPath $backupPath)) {
    throw "Backup file missing: $backupPath"
  }
  Copy-Item -LiteralPath $backupPath -Destination $entry.destination -Force
}

Write-Host "Claude Desktop language files restored from:"
Write-Host $BackupDir
