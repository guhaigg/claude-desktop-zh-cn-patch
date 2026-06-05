$ErrorActionPreference = "Stop"

$pkg = Get-AppxPackage -Name "Claude" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pkg) {
  throw "Claude AppX/MSIX package was not found."
}

$appRoot = Join-Path $pkg.InstallLocation "app"
$exePath = Join-Path $appRoot "Claude.exe"
$resourcesDir = Join-Path $appRoot "resources"
if (-not (Test-Path -LiteralPath $exePath)) {
  throw "Claude AppX executable was not found: $exePath"
}
if (-not (Test-Path -LiteralPath (Join-Path $resourcesDir "en-US.json"))) {
  throw "Claude AppX resources directory is invalid: $resourcesDir"
}

$installScript = Join-Path $PSScriptRoot "install.ps1"
$statePath = Join-Path $PSScriptRoot "backups\launcher-state.json"
$stateDir = Split-Path -Parent $statePath

taskkill.exe /IM Claude.exe /F 2>$null | Out-Null

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installScript -NoRestart -ClaudeAppDir $appRoot

New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
[pscustomobject]@{
  appRoot = $appRoot
  status = "applied"
  updatedAt = (Get-Date).ToString("o")
} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $statePath -Encoding UTF8

Start-Process -FilePath "explorer.exe" -ArgumentList "shell:AppsFolder\$($pkg.PackageFamilyName)!Claude"
