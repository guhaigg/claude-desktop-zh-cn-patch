#!/usr/bin/env bash
set -euo pipefail

repo="${CLAUDE_ZH_CN_PATCH_REPO:-guhaigg/claude-desktop-zh-cn-patch}"
app_dir="${CLAUDE_APP_DIR:-/Applications/Claude.app}"
tmp_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node.js 18+ and retry." >&2
  exit 1
fi

asset_url="$(
  curl -fsSL "https://api.github.com/repos/${repo}/releases/latest" |
    node -e '
      let input = "";
      process.stdin.on("data", (chunk) => input += chunk);
      process.stdin.on("end", () => {
        const release = JSON.parse(input);
        const asset = (release.assets || []).find((entry) =>
          /claude-desktop-zh-cn-patch-macos-.*\.tar\.gz$/.test(entry.name)
        );
        if (!asset) {
          console.error("No macOS tar.gz asset found in latest release.");
          process.exit(1);
        }
        process.stdout.write(asset.browser_download_url);
      });
    '
)"

curl -fL "$asset_url" -o "$tmp_dir/patch.tar.gz"
mkdir -p "$tmp_dir/pkg"
tar -xzf "$tmp_dir/patch.tar.gz" -C "$tmp_dir/pkg"

cd "$tmp_dir/pkg"
chmod +x ./install.sh ./restore.sh 2>/dev/null || true
exec ./install.sh --app-dir "$app_dir" "$@"
