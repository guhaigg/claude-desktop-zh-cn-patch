param(
  [Parameter(Mandatory = $true)]
  [string]$AppRoot,

  [Parameter(Mandatory = $true)]
  [string]$LogPath
)

$ErrorActionPreference = "Stop"

$logDir = Split-Path -Parent $LogPath
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Start-Transcript -LiteralPath $LogPath -Force | Out-Null
try {
  $repoRoot = $PSScriptRoot
  $installScript = Join-Path $repoRoot "install.ps1"
  $resourcesDir = Join-Path $AppRoot "resources"

  if (-not (Test-Path -LiteralPath $installScript)) {
    throw "install.ps1 was not found: $installScript"
  }
  if (-not (Test-Path -LiteralPath (Join-Path $resourcesDir "en-US.json"))) {
    throw "Claude resources directory is invalid: $resourcesDir"
  }

  $nodeDir = "C:\Program Files\nodejs"
  if (Test-Path -LiteralPath $nodeDir) {
    $env:PATH = "$nodeDir;$env:PATH"
  }

  Get-Process Claude -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installScript -NoRestart -ClaudeAppDir $AppRoot

  $required = @(
    (Join-Path $resourcesDir "zh-CN.json"),
    (Join-Path $resourcesDir "ion-dist\i18n\zh-CN.json"),
    (Join-Path $resourcesDir "ion-dist\i18n\statsig\zh-CN.json")
  )
  foreach ($file in $required) {
    if (-not (Test-Path -LiteralPath $file)) {
      throw "Required patched file missing: $file"
    }
  }
} finally {
  Stop-Transcript | Out-Null
}
