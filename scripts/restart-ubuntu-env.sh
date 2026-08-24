#!/usr/bin/env bash

set -e

SCRIPT_PATH="$(realpath "$0")"

# Ensure this script is executable
if [ ! -x "$SCRIPT_PATH" ]; then
    echo "Making script executable..."
    chmod +x "$SCRIPT_PATH"
fi

echo "🔄 Restarting Ubuntu WSL environment..."

# Stop development processes first
pkill -f "next dev" 2>/dev/null || true
pkill -f "anchor test" 2>/dev/null || true
pkill -f "solana-test-validator" 2>/dev/null || true

# Clean common dev ports
for PORT in 3000 3001 8899 8900; do
    PID=$(lsof -ti:$PORT 2>/dev/null || true)

    if [ -n "$PID" ]; then
        echo "Stopping process on port $PORT..."
        kill -9 "$PID" || true
    fi
done

echo "Restart complete."

echo "Starting TrustLink development environment..."

cd "$(dirname "$SCRIPT_PATH")/.."

npm run dev