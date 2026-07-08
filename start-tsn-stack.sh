#!/bin/bash

SESSION_NAME="tsn"
LOG_DIR="$HOME/.tsn-logs"
PROJECT_ROOT="/mnt/c/Users/codepara/Desktop/trust-link"

mkdir -p "$LOG_DIR"

cd "$PROJECT_ROOT"

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi

source .venv/bin/activate

REQ_FILE="$PROJECT_ROOT/tsn-protocol/tsn-mempool-backend/requirements.txt"
REQ_MARKER="$PROJECT_ROOT/.venv/.mempool-requirements-installed"

if [ ! -f "$REQ_MARKER" ] || [ "$REQ_FILE" -nt "$REQ_MARKER" ]; then
  echo "Installing/updating mempool Python requirements..."
  pip install -r "$REQ_FILE"
  touch "$REQ_MARKER"
else
  echo "Mempool Python requirements already installed."
fi

# Activate the project's Python virtual environment
ENV_SETUP="cd $PROJECT_ROOT && source .venv/bin/activate"

MODE="start"
for arg in "$@"; do
  case "$arg" in
    add-cranker)
      MODE="add-cranker"
      ;;
    start-with-cranker)
      MODE="start-with-cranker"
      ;;
    --with-cranker)
      MODE="start-with-cranker"
      ;;
    *)
      ;;
  esac
 done


CRANKER_DIR="$PROJECT_ROOT/tsn-protocol/tsn-cranker-op-daemon"
CRANKER_PKG="$CRANKER_DIR/package.json"
CRANKER_LOCK="$CRANKER_DIR/package-lock.json"
CRANKER_MARKER="$CRANKER_DIR/node_modules/.cranker-deps-installed"

if [ ! -f "$CRANKER_MARKER" ] || [ "$CRANKER_PKG" -nt "$CRANKER_MARKER" ] || [ "$CRANKER_LOCK" -nt "$CRANKER_MARKER" ]; then
  echo "Installing/updating cranker Node dependencies..."
  npm --prefix "$CRANKER_DIR" install
  npm --prefix "$CRANKER_DIR" rebuild esbuild
  mkdir -p "$CRANKER_DIR/node_modules"
  touch "$CRANKER_MARKER"
else
  echo "Cranker Node dependencies already installed."
fi

CRANKER_CMD="cd $PROJECT_ROOT && npm run tsn:cranker:start"

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  if [ "$MODE" = "add-cranker" ] || [ "$MODE" = "start-with-cranker" ]; then
    if tmux list-windows -t "$SESSION_NAME" 2>/dev/null | grep -q '^cranker:'; then
      echo "Cranker window already exists in session '$SESSION_NAME'."
      exit 0
    fi
    echo "Adding cranker window to existing session '$SESSION_NAME'..."
    tmux new-window -t "$SESSION_NAME" -n cranker
    tmux send-keys -t "$SESSION_NAME:cranker" "$CRANKER_CMD 2>&1 | tee $LOG_DIR/cranker.log" C-m
    echo "Added cranker window to session '$SESSION_NAME'."
    exit 0
  fi
  echo "TMUX session '$SESSION_NAME' already exists. Not starting another stack."
  exit 0
fi

declare -A SERVICES=(
  ["backend"]="$ENV_SETUP && npm run backend:dev"
  ["frontend"]="$ENV_SETUP && npm run frontend:dev"
  ["mempool"]="$ENV_SETUP && npm run mempool:backend:dev"
  ["rpc-gateway"]="$ENV_SETUP && npm run rpc:gateway:dev"
)

if [ "$MODE" = "start-with-cranker" ]; then
  SERVICES["cranker"]="$CRANKER_CMD"
fi

# Start a new tmux session in detached mode
rm -f "$LOG_DIR/tsn-*.log"
tmux new-session -d -s $SESSION_NAME -n monitor

# Create the monitor window
tmux send-keys -t $SESSION_NAME:monitor "btop || htop || top" C-m
tmux new-window -t $SESSION_NAME -n network
tmux send-keys -t $SESSION_NAME:network "sudo nethogs" C-m

# Iterate over the services and create a window for each
for service in "${!SERVICES[@]}"; do
  # We pipe output to tee to log files so you can check logs anytime as per step 6
  cmd="${SERVICES[$service]} 2>&1 | tee $LOG_DIR/${service}.log"
  tmux new-window -t $SESSION_NAME -n "$service"
  tmux send-keys -t $SESSION_NAME:"$service" "$cmd" C-m
 done

echo "TSN Stack started in tmux session '$SESSION_NAME'."
echo "Attach using: tmux attach -t $SESSION_NAME"
echo "Check logs anytime with: tail -f $LOG_DIR/<service>.log"
