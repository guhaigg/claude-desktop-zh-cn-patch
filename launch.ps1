param(
  [switch]$PreferLocal
)

$ErrorActionPreference = "Stop"

function Get-ClaudeTarget {
  if (-not $PreferLocal) {
    $pkg = Get-AppxPackage -Name "Claude" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pkg) {
      $candidate = Join-Path $pkg.InstallLocation "app\Claude.exe"
      if (Test-Path -LiteralPath $candidate) {
        return [pscustomobject]@{
          kind = "appx"
          exePath = $candidate
          appRoot = Split-Path -Parent $candidate
          resourcesDir = Join-Path (Split-Path -Parent $candidate) "resources"
          appUserModelId = "$($pkg.PackageFamilyName)!Claude"
        }
      }
    }
  }

  $localRoot = Join-Path $env:LOCALAPPDATA "AnthropicClaude"
  if (Test-Path -LiteralPath $localRoot) {
    $appDir = Get-ChildItem -LiteralPath $localRoot -Directory -Filter "app-*" |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if ($appDir) {
      $candidate = Join-Path $appDir.FullName "claude.exe"
      if (Test-Path -LiteralPath $candidate) {
        return [pscustomobject]@{
          kind = "squirrel"
          exePath = $candidate
          appRoot = Split-Path -Parent $candidate
          resourcesDir = Join-Path (Split-Path -Parent $candidate) "resources"
          appUserModelId = $null
        }
      }
    }
  }

  throw "Claude Desktop executable was not found."
}

$target = Get-ClaudeTarget

if ($target.kind -eq "appx") {
  # Package activation keeps Claude under its MSIX identity; direct exe launch can make Cowork think the install is unsupported.
  Start-Process -FilePath "explorer.exe" -ArgumentList "shell:AppsFolder\$($target.appUserModelId)"
} else {
  Start-Process -FilePath $target.exePath
}
