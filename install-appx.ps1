param(
  [switch]$NoLaunch
)

$ErrorActionPreference = "Stop"

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

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
$workerScript = Join-Path $PSScriptRoot "install-appx-system-worker.ps1"
$statePath = Join-Path $PSScriptRoot "backups\launcher-state.json"
$stateDir = Split-Path -Parent $statePath
$logDir = Join-Path $PSScriptRoot "backups"
$logPath = Join-Path $logDir "install-appx-system.log"

if (-not (Test-IsAdmin)) {
  throw "AppX patching must be launched through install-uac.vbs or an elevated PowerShell window."
}

if (-not (Test-Path -LiteralPath $workerScript)) {
  throw "SYSTEM worker script was not found: $workerScript"
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Remove-Item -LiteralPath $logPath -Force -ErrorAction SilentlyContinue

Get-Process Claude -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$taskName = "ClaudeZhCnPatch-" + ([guid]::NewGuid().ToString("N"))
$workerArgs = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$workerScript`"",
  "-AppRoot", "`"$appRoot`"",
  "-LogPath", "`"$logPath`""
) -join " "

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $workerArgs
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
$task = New-ScheduledTask -Action $action -Principal $principal

try {
  Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null
  Start-ScheduledTask -TaskName $taskName

  $deadline = (Get-Date).AddMinutes(5)
  do {
    Start-Sleep -Milliseconds 800
    $scheduledTask = Get-ScheduledTask -TaskName $taskName
    $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName
  } while ($scheduledTask.State -ne "Ready" -and (Get-Date) -lt $deadline)

  if ($scheduledTask.State -ne "Ready") {
    throw "SYSTEM patch task did not finish before timeout. Log: $logPath"
  }

  if ($taskInfo.LastTaskResult -ne 0) {
    throw "SYSTEM patch task failed with code $($taskInfo.LastTaskResult). Log: $logPath"
  }
} finally {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
}

if (-not (Test-Path -LiteralPath (Join-Path $resourcesDir "zh-CN.json"))) {
  throw "Patch task completed but zh-CN.json was not written. Log: $logPath"
}

New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
[pscustomobject]@{
  appRoot = $appRoot
  status = "applied"
  updatedAt = (Get-Date).ToString("o")
} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $statePath -Encoding UTF8

if (-not $NoLaunch) {
  Start-Process -FilePath "explorer.exe" -ArgumentList "shell:AppsFolder\$($pkg.PackageFamilyName)!Claude"
}
