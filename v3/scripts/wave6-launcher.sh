#!/bin/bash
# Wave 6 Launcher Script
# Scheduled to run WP22, WP23, WP24 with Claude Code
#
# Created: $(date)
# Purpose: Resume Wave 6 work packages after 3-hour delay

set -e

# Configuration
PROJECT_DIR="/Users/russellcashman/ba2/code/TheSwarmCometh/claude-flow"
INSTRUCTIONS_FILE="$PROJECT_DIR/v3/scripts/wave6-remaining-instructions.md"
LOG_FILE="$PROJECT_DIR/v3/scripts/wave6-execution.log"
TMUX_SESSION="wave6-claude"

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."

    if ! command -v claude &> /dev/null; then
        log "ERROR: claude CLI not found in PATH"
        exit 1
    fi

    if ! command -v tmux &> /dev/null; then
        log "ERROR: tmux not found - install with 'brew install tmux'"
        exit 1
    fi

    if [ ! -f "$INSTRUCTIONS_FILE" ]; then
        log "ERROR: Instructions file not found at $INSTRUCTIONS_FILE"
        exit 1
    fi

    log "Prerequisites OK"
}

# Create the prompt for Claude
create_prompt() {
    cat << 'PROMPT'
You are resuming Wave 6 of the claude-flow v3 implementation.

## Context
Waves 1-5 and WP21 are complete (~994 tests). You need to implement WP22, WP23, WP24.

## Instructions
Read the detailed specifications at:
/Users/russellcashman/ba2/code/TheSwarmCometh/claude-flow/v3/scripts/wave6-remaining-instructions.md

## Tasks
1. **WP22: Performance Benchmarking Suite** - Create benchmarks in @claude-flow/testing/src/benchmarks/
2. **WP23: Migration Tooling** - Create v2->v3 migration in @claude-flow/cli/src/commands/migrate/
3. **WP24: Documentation & Examples** - Create docs in v3/docs/ and examples in v3/examples/

## Requirements
- Use Sonnet model for Task tool
- ES modules with .js extensions
- vitest for testing
- >80% test coverage for WP22, WP23

Execute these sequentially. Start with WP22.
PROMPT
}

# Main execution
main() {
    log "=== Wave 6 Launcher Started ==="

    check_prerequisites

    cd "$PROJECT_DIR"
    log "Changed to project directory: $PROJECT_DIR"

    # Check if tmux session already exists
    if tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
        log "Tmux session '$TMUX_SESSION' already exists. Attaching..."
        tmux attach -t "$TMUX_SESSION"
    else
        log "Creating new tmux session: $TMUX_SESSION"

        # Create a temporary file with the prompt
        PROMPT_FILE=$(mktemp)
        create_prompt > "$PROMPT_FILE"

        # Start tmux session with claude
        tmux new-session -d -s "$TMUX_SESSION" -c "$PROJECT_DIR"

        # Send the claude command to the tmux session
        tmux send-keys -t "$TMUX_SESSION" "claude --dangerously-skip-permissions -p \"\$(cat $PROMPT_FILE)\" 2>&1 | tee -a $LOG_FILE" Enter

        log "Claude started in tmux session '$TMUX_SESSION'"
        log "To attach: tmux attach -t $TMUX_SESSION"
        log "To check logs: tail -f $LOG_FILE"

        # Optionally attach to the session
        if [ "$1" = "--attach" ]; then
            tmux attach -t "$TMUX_SESSION"
        fi
    fi

    log "=== Launcher Complete ==="
}

# Run main function
main "$@"
