param(
  [switch]$PreferLocal,
  [switch]$NoAutoPatch
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

function Test-SameFileHash {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Left,

    [Parameter(Mandatory = $true)]
    [string]$Right
  )

  if (-not (Test-Path -LiteralPath $Left) -or -not (Test-Path -LiteralPath $Right)) {
    return $false
  }

  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Left).Hash -eq
    (Get-FileHash -Algorithm SHA256 -LiteralPath $Right).Hash
}

function Get-PatchDrift {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ResourcesDir
  )

  $checks = @(
    "en-US.json",
    "zh-CN.json",
    "ion-dist\i18n\en-US.json",
    "ion-dist\i18n\zh-CN.json",
    "ion-dist\i18n\statsig\en-US.json",
    "ion-dist\i18n\statsig\zh-CN.json"
  )

  $patchResources = Join-Path $PSScriptRoot "patch\resources"
  $drift = foreach ($relative in $checks) {
    $source = Join-Path $patchResources $relative
    $target = Join-Path $ResourcesDir $relative
    if (-not (Test-SameFileHash -Left $source -Right $target)) {
      $relative
    }
  }

  return @($drift)
}

function Invoke-AppxPatchIfNeeded {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Target
  )

  if ($NoAutoPatch -or $Target.kind -ne "appx") {
    return $Target
  }

  $drift = Get-PatchDrift -ResourcesDir $Target.resourcesDir
  if ($drift.Count -eq 0) {
    return $Target
  }

  $installer = Join-Path $PSScriptRoot "install-appx.ps1"
  if (-not (Test-Path -LiteralPath $installer)) {
    Write-Warning "Patch drift detected, but install-appx.ps1 was not found: $installer"
    return $Target
  }

  Write-Host "Claude resources need patch refresh: $($drift -join ', ')"
  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$installer`"",
    "-NoLaunch"
  )

  $process = Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -Verb RunAs -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    Write-Warning "Patch refresh was not completed. Exit code: $($process.ExitCode)"
    return $Target
  }

  $refreshedTarget = Get-ClaudeTarget
  $remainingDrift = Get-PatchDrift -ResourcesDir $refreshedTarget.resourcesDir
  if ($remainingDrift.Count -gt 0) {
    Write-Warning "Patch refresh completed, but resources still differ: $($remainingDrift -join ', ')"
  }

  return $refreshedTarget
}

$target = Get-ClaudeTarget
$target = Invoke-AppxPatchIfNeeded -Target $target

if ($target.kind -eq "appx") {
  # Package activation keeps Claude under its MSIX identity; direct exe launch can make Cowork think the install is unsupported.
  Start-Process -FilePath "explorer.exe" -ArgumentList "shell:AppsFolder\$($target.appUserModelId)"
} else {
  Start-Process -FilePath $target.exePath
}
