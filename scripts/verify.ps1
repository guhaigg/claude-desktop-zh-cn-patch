$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$files = @(
  "patch\resources\zh-CN.json",
  "patch\resources\en-US.json",
  "patch\resources\ion-dist\i18n\zh-CN.json",
  "patch\resources\ion-dist\i18n\en-US.json"
)

foreach ($relative in $files) {
  $path = Join-Path $root $relative
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Missing file: $relative"
  }
  $raw = [IO.File]::ReadAllText($path).TrimStart([char]0xFEFF)
  try {
    $json = $raw | ConvertFrom-Json
  } catch {
    throw "Invalid JSON: $relative :: $($_.Exception.Message)"
  }
  Write-Host ("OK {0} entries={1}" -f $relative, @($json.PSObject.Properties).Count)
}

$ionRaw = [IO.File]::ReadAllText((Join-Path $root "patch\resources\ion-dist\i18n\en-US.json")).TrimStart([char]0xFEFF)
$ion = $ionRaw | ConvertFrom-Json
$checks = @("v7i2fnB2+A", "5huDSewExH", "53DiPrdI5r", "SKeCK+7hmh")

foreach ($key in $checks) {
  $actual = $ion.PSObject.Properties[$key].Value
  if (-not $actual -or $actual -notmatch "[\u4e00-\u9fff]") {
    throw "Translation check failed: $key does not contain CJK text."
  }
}

$secretPatterns = @(
  "sk-[A-Za-z0-9_-]{12,}"
)

Get-ChildItem -LiteralPath $root -Recurse -File |
  Where-Object { $_.FullName -notmatch "\\backups\\" } |
  ForEach-Object {
    $text = [IO.File]::ReadAllText($_.FullName)
    foreach ($pattern in $secretPatterns) {
      if ($text -match $pattern) {
        throw "Potential secret found in $($_.FullName): $pattern"
      }
    }
  }

Write-Host "Verification passed."
