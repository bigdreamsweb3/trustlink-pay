#!/usr/bin/env bash
set -euo pipefail

SESSION="tsn"
ROOT="${TSN_ROOT:-$(pwd)}"
LOG_DIR="$HOME/.tsn-logs"
VENV="$ROOT/.venv"

CMD="${1:-up}"
ARG="${2:-core}"

mkdir -p "$LOG_DIR"

exists() {
  tmux has-session -t "$SESSION" 2>/dev/null
}

window_exists() {
  tmux list-windows -t "$SESSION" 2>/dev/null | grep -q "^$1:"
}

ensure_session() {
  if ! exists; then
    tmux new-session -d -s "$SESSION" -n control
    tmux send-keys -t "$SESSION:control" "cd '$ROOT' && echo 'TSN control window. Use: tsn status, tsn logs frontend, tsn down.' && sleep infinity" C-m
  fi
}

ensure_node() {
  local dir="$1"
  local marker="$dir/node_modules/.deps-installed"

  if [[ ! -f "$marker" || "$dir/package.json" -nt "$marker" ]]; then
    echo "Installing deps -> $dir"
    npm --prefix "$dir" install --silent
    mkdir -p "$dir/node_modules"
    touch "$marker"
  fi
}

ensure_python() {
  [[ -d "$VENV" ]] || python3 -m venv "$VENV"

  local req="$ROOT/tsn-protocol/tsn-mempool-backend/requirements.txt"
  local marker="$VENV/.deps-installed"

  if [[ ! -f "$marker" || "$req" -nt "$marker" ]]; then
    echo "Installing python deps"
    "$VENV/bin/pip" install -r "$req"
    touch "$marker"
  fi
}

start() {
  local name="$1"
  local cmd="$2"

  ensure_session

  if window_exists "$name"; then
    echo "$name already running"
    return
  fi

  : > "$LOG_DIR/$name.log"
  tmux new-window -t "$SESSION" -n "$name"
  tmux send-keys -t "$SESSION:$name" "cd '$ROOT' && $cmd >> '$LOG_DIR/$name.log' 2>&1" C-m
  echo "Started $name -> $LOG_DIR/$name.log"
}

stop_window() {
  local name="$1"

  if ! window_exists "$name"; then
    echo "$name not running"
    return
  fi

  tmux kill-window -t "$SESSION:$name"
  echo "Stopped $name"
}

print_done() {
  echo ""
  echo "TSN started in background."
  echo "Open app: http://localhost:3001"
  echo "Status:   tsn status"
  echo "Logs:     tsn logs frontend  or  tsn logs backend"
  echo "Stop:     tsn down"
  echo "Attach:   tsn attach"
}

case "$CMD" in
  up)
    echo "Starting TSN profile -> $ARG"

    case "$ARG" in
      core)
        ensure_node "$ROOT/frontend"
        ensure_node "$ROOT/backend"
        start backend "NODE_OPTIONS='--max-old-space-size=768' npm --prefix backend run dev"
        start frontend "NODE_OPTIONS='--max-old-space-size=1024' npm --prefix frontend run dev"
        ;;
      frontend)
        ensure_node "$ROOT/frontend"
        start frontend "NODE_OPTIONS='--max-old-space-size=1024' npm --prefix frontend run dev"
        ;;
      backend)
        ensure_node "$ROOT/backend"
        start backend "NODE_OPTIONS='--max-old-space-size=768' npm --prefix backend run dev"
        ;;
      mempool)
        ensure_python
        start mempool "$VENV/bin/python -u tsn-protocol/tsn-mempool-backend/server.py"
        ;;
      rpc)
        ensure_node "$ROOT/tsn-protocol/tsn-rpc-gateway"
        start rpc "NODE_OPTIONS='--max-old-space-size=512' npm --prefix tsn-protocol/tsn-rpc-gateway run dev"
        ;;
      full)
        ensure_node "$ROOT/frontend"
        ensure_node "$ROOT/backend"
        ensure_node "$ROOT/tsn-protocol/tsn-rpc-gateway"
        ensure_python
        start backend "NODE_OPTIONS='--max-old-space-size=768' npm --prefix backend run dev"
        start frontend "NODE_OPTIONS='--max-old-space-size=1024' npm --prefix frontend run dev"
        start mempool "$VENV/bin/python -u tsn-protocol/tsn-mempool-backend/server.py"
        start rpc "NODE_OPTIONS='--max-old-space-size=512' npm --prefix tsn-protocol/tsn-rpc-gateway run dev"
        ;;
      *)
        echo "Unknown profile: $ARG"
        exit 1
        ;;
    esac

    print_done
    ;;
  down)
    tmux kill-session -t "$SESSION" 2>/dev/null || true
    pkill -f "tail -f $LOG_DIR" 2>/dev/null || true
    echo "TSN stopped"
    ;;
  restart)
    "$0" down
    "$0" up "$ARG"
    ;;
  start-service)
    "$0" up "$ARG"
    ;;
  stop-service)
    if ! exists; then
      echo "Session not running"
      exit 0
    fi
    stop_window "$ARG"
    ;;
  restart-service)
    "$0" stop-service "$ARG"
    sleep 1
    "$0" start-service "$ARG"
    ;;
  attach)
    tmux attach -t "$SESSION"
    ;;
  status)
    if exists; then
      echo "Running:"
      tmux list-windows -t "$SESSION"
    else
      echo "TSN not running"
    fi
    ;;
  logs)
    tail -n 80 -f "$LOG_DIR/$ARG.log"
    ;;
  *)
    echo "Usage:"
    echo "  tsn up [core|frontend|backend|mempool|rpc|full]"
    echo "  tsn down"
    echo "  tsn restart [profile]"
    echo "  tsn start-service [service]"
    echo "  tsn stop-service [service]"
    echo "  tsn restart-service [service]"
    echo "  tsn status"
    echo "  tsn attach"
    echo "  tsn logs [service]"
    ;;
esac
