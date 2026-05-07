param(
  [switch]$NoRestart,
  [switch]$NoForceEnglishSlot,
  [string]$ClaudeAppDir
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Administrator privileges are required. Right-click PowerShell and choose 'Run as administrator', then run install.ps1 again."
  }
}

function Get-RepoRoot {
  if ($PSScriptRoot) { return $PSScriptRoot }
  return (Get-Location).Path
}

function Resolve-ClaudeAppDir {
  param([string]$ExplicitDir)

  if ($ExplicitDir) {
    if (-not (Test-Path -LiteralPath (Join-Path $ExplicitDir "resources"))) {
      throw "Invalid Claude app directory: $ExplicitDir"
    }
    return (Resolve-Path -LiteralPath $ExplicitDir).Path
  }

  $packages = @(Get-AppxPackage -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -eq "Claude" -or $_.PackageFamilyName -like "Claude_*" -or $_.InstallLocation -like "*\Claude_*"
  })
  foreach ($package in $packages) {
    if ($package.InstallLocation) {
      $candidate = Join-Path $package.InstallLocation "app"
      if (Test-Path -LiteralPath (Join-Path $candidate "resources")) {
        return $candidate
      }
    }
  }

  $windowsApps = Join-Path $env:ProgramFiles "WindowsApps"
  $candidate = Get-ChildItem -LiteralPath $windowsApps -Directory -Filter "Claude_*" -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName "app" } |
    Where-Object { Test-Path -LiteralPath (Join-Path $_ "resources") } |
    Select-Object -First 1

  if ($candidate) { return $candidate }
  throw "Official Claude Desktop installation was not found."
}

function Grant-WriteAccess {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  & takeown.exe /F $Path /A /R /D Y | Out-Null
  & icacls.exe $Path /grant "${env:USERNAME}:(OI)(CI)F" /T /C | Out-Null
}

function Copy-WithBackup {
  param(
    [string]$Source,
    [string]$Destination,
    [string]$BackupDir
  )

  if (-not (Test-Path -LiteralPath $Source)) {
    throw "Patch file not found: $Source"
  }

  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
  if (Test-Path -LiteralPath $Destination) {
    $backupName = "{0}.bak" -f ([Guid]::NewGuid().ToString("N"))
    Copy-Item -LiteralPath $Destination -Destination (Join-Path $BackupDir $backupName) -Force
    $script:RestoreManifest += [pscustomobject]@{
      backup = $backupName
      destination = $Destination
    }
  }

  Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

Assert-Admin

$repoRoot = Get-RepoRoot
$patchRoot = Join-Path $repoRoot "patch\resources"
$patchIon = Join-Path $patchRoot "ion-dist\i18n"
$targetApp = Resolve-ClaudeAppDir -ExplicitDir $ClaudeAppDir
$targetResources = Join-Path $targetApp "resources"
$targetIon = Join-Path $targetResources "ion-dist\i18n"

if (-not (Test-Path -LiteralPath $targetIon)) {
  throw "Claude ion i18n directory was not found: $targetIon"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $repoRoot "backups\claude-desktop-language.$stamp"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$script:RestoreManifest = @()

if (-not $NoRestart) {
  taskkill.exe /IM Claude.exe /F 2>$null | Out-Null
  Start-Sleep -Seconds 1
}

Grant-WriteAccess $targetResources
Grant-WriteAccess $targetIon

Copy-WithBackup (Join-Path $patchRoot "zh-CN.json") (Join-Path $targetResources "zh-CN.json") $backupDir
Copy-WithBackup (Join-Path $patchIon "zh-CN.json") (Join-Path $targetIon "zh-CN.json") $backupDir

if (-not $NoForceEnglishSlot) {
  Copy-WithBackup (Join-Path $patchRoot "en-US.json") (Join-Path $targetResources "en-US.json") $backupDir
  Copy-WithBackup (Join-Path $patchIon "en-US.json") (Join-Path $targetIon "en-US.json") $backupDir
}

$knownLanguageFiles = @(
  "zh-CN.json",
  "en-US.json",
  "ion-dist\i18n\zh-CN.json",
  "ion-dist\i18n\en-US.json"
)

Get-ChildItem -LiteralPath $patchRoot -Recurse -File |
  ForEach-Object {
    $relative = $_.FullName.Substring($patchRoot.Length).TrimStart("\", "/")
    if ($knownLanguageFiles -contains $relative) { return }
    $destination = Join-Path $targetResources $relative
    Copy-WithBackup $_.FullName $destination $backupDir
  }

$manifestText = $script:RestoreManifest | ConvertTo-Json -Depth 10
[IO.File]::WriteAllText((Join-Path $backupDir "restore-manifest.json"), $manifestText, [Text.UTF8Encoding]::new($false))

$configPaths = @(
  (Join-Path $env:LOCALAPPDATA "Claude-3p\config.json"),
  (Join-Path $env:APPDATA "Claude\config.json"),
  (Join-Path $env:LOCALAPPDATA "Claude-3p\claude_desktop_config.json"),
  (Join-Path $env:APPDATA "Claude\claude_desktop_config.json")
)

foreach ($configPath in $configPaths) {
  if (Test-Path -LiteralPath $configPath) {
    try {
      $raw = [IO.File]::ReadAllText($configPath).TrimStart([char]0xFEFF)
      $json = $raw | ConvertFrom-Json
      $json | Add-Member -NotePropertyName locale -NotePropertyValue "zh-CN" -Force
      $json | Add-Member -NotePropertyName language -NotePropertyValue "zh-CN" -Force
      $jsonText = $json | ConvertTo-Json -Depth 100
      [IO.File]::WriteAllText($configPath, $jsonText, [Text.UTF8Encoding]::new($false))
    } catch {
      Write-Warning "Skipped invalid config: $configPath"
    }
  }
}

if (-not $NoRestart) {
  Start-Process -FilePath (Join-Path $targetApp "Claude.exe")
}

Write-Host "Claude Desktop Chinese patch installed."
Write-Host "Target: $targetApp"
Write-Host "Backup: $backupDir"
Write-Host "Use restore.ps1 to roll back."
