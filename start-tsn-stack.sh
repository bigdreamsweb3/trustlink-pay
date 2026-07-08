#!/bin/bash

SESSION_NAME="tsn"
LOG_DIR="$HOME/.tsn-logs"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Define the root directory of the project
# This assumes the script is run within WSL and the project is at this path
PROJECT_ROOT="/mnt/c/Users/codepara/Desktop/trust-link"

# Define the services with their start commands
declare -A SERVICES=(
  ["backend"]="cd $PROJECT_ROOT && npm run backend:dev"
  ["frontend"]="cd $PROJECT_ROOT && npm run frontend:dev"
  ["mempool"]="cd $PROJECT_ROOT && npm run mempool:dev"
  ["rpc-gateway"]="cd $PROJECT_ROOT && npm run rpc:gateway:dev"
  # ["cranker"]="cd $PROJECT_ROOT && npm run tsn:cranker:start"
)

# Start a new tmux session in detached mode
tmux new-session -d -s $SESSION_NAME -n monitor

# Create the monitor window
tmux send-keys -t $SESSION_NAME:monitor "htop || top" C-m

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
