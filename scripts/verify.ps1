param(
  [string]$AppDir,
  [switch]$NoForceEnglishSlot
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "verify-patch.mjs"
$arguments = @($scriptPath)

if ($AppDir) {
  $arguments += "--app-dir"
  $arguments += $AppDir
}

if ($NoForceEnglishSlot) {
  $arguments += "--no-force-english-slot"
}

& node @arguments
