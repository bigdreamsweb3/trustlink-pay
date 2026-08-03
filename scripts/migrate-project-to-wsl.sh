#!/usr/bin/env bash
set -euo pipefail

SOURCE="${SOURCE:-/mnt/c/Users/codepara/Desktop/trust-link}"
TARGET="${TARGET:-$HOME/projects/trust-link}"

EXCLUDES=(
  "--exclude=node_modules"
  "--exclude=.next"
  "--exclude=dist"
  "--exclude=build"
  "--exclude=coverage"
  "--exclude=__pycache__"
  "--exclude=.pytest_cache"
  "--exclude=.venv"
  "--exclude=venv"
  "--exclude=.tsn-logs"
  "--exclude=target"
)

if [[ ! -d "$SOURCE/.git" ]]; then
  echo "Source is not a Git worktree: $SOURCE" >&2
  exit 1
fi

mkdir -p "$(dirname "$TARGET")"

if [[ -e "$TARGET" && ! -d "$TARGET/.git" ]]; then
  echo "Target exists but is not a Git worktree: $TARGET" >&2
  exit 1
fi

echo "Source Git status:"
git -C "$SOURCE" status --short

if [[ ! -e "$TARGET" ]]; then
  echo "Copying project to native WSL filesystem: $TARGET"
  rsync -a --delete "${EXCLUDES[@]}" "$SOURCE/" "$TARGET/"
else
  echo "Updating existing WSL copy: $TARGET"
  rsync -a --delete "${EXCLUDES[@]}" "$SOURCE/" "$TARGET/"
fi

echo "Target Git status:"
git -C "$TARGET" status --short

cd "$TARGET"

echo "Installing Node dependencies from lockfiles..."
npm install
npm --prefix frontend install
npm --prefix backend install
npm --prefix tsn-protocol/tsn-mempool-ui install

echo "Creating Python virtual environment..."
python3 -m venv .venv
source .venv/bin/activate
pip install -r tsn-protocol/tsn-node/requirements.txt

echo "Migration complete."
echo "Original Windows copy preserved at: $SOURCE"
echo "Open migrated repo with:"
echo "  cd $TARGET"
echo "  code ."
