#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$HOME/bin"
TARGET="$BIN_DIR/tsn"

mkdir -p "$BIN_DIR"
cp "$ROOT/scripts/tsn-dev-cli.sh" "$TARGET"
chmod +x "$TARGET"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    echo "Add this to ~/.bashrc if tsn is not found in a new terminal:"
    echo "export PATH=\"$BIN_DIR:\$PATH\""
    ;;
esac

echo "TSN dev CLI installed at $TARGET"
echo "Light start: tsn up core"
echo "Stop all:    tsn down"
echo "Logs:        tsn logs frontend"
