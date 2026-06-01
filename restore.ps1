param(
  [string]$BackupDir,
  [string]$ClaudeAppDir
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "scripts\restore-patch.mjs"
$arguments = @($scriptPath)

if ($BackupDir) {
  $arguments += "--backup-dir"
  $arguments += $BackupDir
}

if ($ClaudeAppDir) {
  $arguments += "--app-dir"
  $arguments += $ClaudeAppDir
}

& node @arguments
