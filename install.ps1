param(
  [switch]$NoRestart,
  [switch]$NoForceEnglishSlot,
  [string]$ClaudeAppDir,
  [string]$BackupDir,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "scripts\apply-patch.mjs"
$arguments = @($scriptPath)

if ($NoRestart) {
  $arguments += "--no-restart"
}

if ($NoForceEnglishSlot) {
  $arguments += "--no-force-english-slot"
}

if ($ClaudeAppDir) {
  $arguments += "--app-dir"
  $arguments += $ClaudeAppDir
}

if ($BackupDir) {
  $arguments += "--backup-dir"
  $arguments += $BackupDir
}

if ($DryRun) {
  $arguments += "--dry-run"
}

& node @arguments
