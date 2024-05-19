#!/bin/bash

# m h  dom mon dow   command
# * * * * * /full/path/to/keep.sh

CURRENT_DIR="${BASH_SOURCE[0]%/*}"
TMUX_SESSION="chatnext-session"
RUN_SCRIPT="$CURRENT_DIR/run.sh"

if tmux has-session -t $TMUX_SESSION 2>/dev/null; then
	:
else
	# Create a new tmux session and run the script
	cd "$CURRENT_DIR"
	tmux new-session -d -s $TMUX_SESSION "bash $RUN_SCRIPT"
fi
