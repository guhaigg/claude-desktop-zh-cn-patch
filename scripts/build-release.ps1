param(
  [string]$Version = "dev"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot "verify.ps1")

$dist = Join-Path $root "dist"
New-Item -ItemType Directory -Force -Path $dist | Out-Null

$safeVersion = $Version -replace "[^A-Za-z0-9._-]", "-"
$zip = Join-Path $dist "claude-desktop-zh-cn-patch-$safeVersion.zip"
if (Test-Path -LiteralPath $zip) {
  Remove-Item -LiteralPath $zip -Force
}

$exclude = "\\(dist|backups|\.git)\\"
$items = Get-ChildItem -LiteralPath $root -Force |
  Where-Object { $_.Name -notin @("dist", "backups", ".git") }

Compress-Archive -Path $items.FullName -DestinationPath $zip -Force
Write-Host "Release zip: $zip"
