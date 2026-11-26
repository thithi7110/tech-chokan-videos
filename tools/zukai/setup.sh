#!/usr/bin/env bash
# 図解ショートの環境を用意する（先に ../setup.sh で VOICEVOX を用意しておく）。何度実行してもよい。
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules/remotion ] || npm ci --no-audit --no-fund >/dev/null
# Remotion 付属のブラウザは取得できない環境があるので、入っている Chrome を使う
CHROME=${CHROME:-$(command -v google-chrome || command -v chromium || ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}
[ -x "$CHROME" ] || { echo "Chrome が見つからない"; exit 1; }
echo "CHROME=$CHROME"
echo "zukai setup ok"
