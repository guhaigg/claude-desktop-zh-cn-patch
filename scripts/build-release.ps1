param(
  [string]$Version = "dev"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot "verify.ps1")

$dist = Join-Path $root "dist"
New-Item -ItemType Directory -Force -Path $dist | Out-Null

$safeVersion = $Version -replace "[^A-Za-z0-9._-]", "-"
$items = Get-ChildItem -LiteralPath $root -Force |
  Where-Object { $_.Name -notin @("dist", "backups", ".git") }

$artifacts = @(
  @{ platform = "windows"; archive = Join-Path $dist "claude-desktop-zh-cn-patch-windows-$safeVersion.zip"; kind = "zip" },
  @{ platform = "macos"; archive = Join-Path $dist "claude-desktop-zh-cn-patch-macos-$safeVersion.tar.gz"; kind = "tar.gz" },
  @{ platform = "linux"; archive = Join-Path $dist "claude-desktop-zh-cn-patch-linux-$safeVersion.tar.gz"; kind = "tar.gz" }
)

foreach ($artifact in $artifacts) {
  if (Test-Path -LiteralPath $artifact.archive) {
    Remove-Item -LiteralPath $artifact.archive -Force
  }

  if ($artifact.kind -eq "zip") {
    Compress-Archive -Path $items.FullName -DestinationPath $artifact.archive -Force
  } else {
    & tar.exe --exclude dist --exclude backups --exclude .git -czf $artifact.archive -C $root .
  }

  Write-Host ("Built {0}: {1}" -f $artifact.platform, $artifact.archive)
}

$releaseManifest = Join-Path $dist "release-manifest-$safeVersion.json"
@{
  version = $safeVersion
  generatedAt = (Get-Date).ToString("s")
  artifacts = @($artifacts | ForEach-Object {
    @{
      platform = $_.platform
      file = Split-Path -Leaf $_.archive
      kind = $_.kind
    }
  })
} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $releaseManifest -Encoding utf8

Write-Host "Release manifest: $releaseManifest"
