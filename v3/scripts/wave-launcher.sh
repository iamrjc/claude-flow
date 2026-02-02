#!/bin/bash
# Wave Launcher Script for Waves 6, 7, 8
# Usage: ./wave-launcher.sh <wave_number> [--attach]

set -e

WAVE=${1:-6}
PROJECT_DIR="/Users/russellcashman/ba2/code/TheSwarmCometh/claude-flow"
INSTRUCTIONS_FILE="$PROJECT_DIR/v3/scripts/wave6-8-instructions.md"
LOG_FILE="$PROJECT_DIR/v3/scripts/wave${WAVE}-execution.log"
TMUX_SESSION="wave${WAVE}-claude"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_prerequisites() {
    log "Checking prerequisites..."
    command -v claude &> /dev/null || { log "ERROR: claude CLI not found"; exit 1; }
    command -v tmux &> /dev/null || { log "ERROR: tmux not found"; exit 1; }
    [ -f "$INSTRUCTIONS_FILE" ] || { log "ERROR: Instructions file not found"; exit 1; }
    log "Prerequisites OK"
}

get_wave_prompt() {
    case $WAVE in
        6)
            cat << 'PROMPT'
You are resuming Wave 6 of claude-flow v3 implementation.

Read the detailed specifications at:
/Users/russellcashman/ba2/code/TheSwarmCometh/claude-flow/v3/scripts/wave6-8-instructions.md

Implement Wave 6 (WP22-24) sequentially using Sonnet:
- WP22: Performance Benchmarking Suite (30+ benchmarks)
- WP23: Migration Tooling v2->v3 (35+ tests)
- WP24: Documentation & Examples (11 docs, 5 examples)

Use the Task tool with model="sonnet" for each WP.
PROMPT
            ;;
        7)
            cat << 'PROMPT'
You are implementing Wave 7 of claude-flow v3.

Read the detailed specifications at:
/Users/russellcashman/ba2/code/TheSwarmCometh/claude-flow/v3/scripts/wave6-8-instructions.md

Implement Wave 7 (WP25-28) using Sonnet:
- WP25: Security Module (auth, RBAC, encryption, audit) - 40+ tests
- WP26: Observability Module (logging, metrics, tracing) - 35+ tests
- WP27: Caching Layer (memory, disk, strategies) - 35+ tests
- WP28: Rate Limiting & Throttling (algorithms, policies) - 30+ tests

Use the Task tool with model="sonnet" for each WP. Run in parallel if possible.
PROMPT
            ;;
        8)
            cat << 'PROMPT'
You are implementing Wave 8 of claude-flow v3.

Read the detailed specifications at:
/Users/russellcashman/ba2/code/TheSwarmCometh/claude-flow/v3/scripts/wave6-8-instructions.md

Implement Wave 8 (WP29-32) using Sonnet:
- WP29: WebSocket Support (real-time bidirectional) - 30+ tests
- WP30: Event Streaming SSE (one-way streaming) - 25+ tests
- WP31: Workflow Templates (code-review, research, etc.) - 30+ tests
- WP32: Admin Dashboard (web UI, APIs) - 25+ tests

Use the Task tool with model="sonnet" for each WP. Run in parallel if possible.
PROMPT
            ;;
        *)
            log "ERROR: Unknown wave number: $WAVE"
            exit 1
            ;;
    esac
}

main() {
    log "=== Wave $WAVE Launcher Started ==="
    check_prerequisites
    cd "$PROJECT_DIR"

    if tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
        log "Tmux session '$TMUX_SESSION' exists. Attaching..."
        tmux attach -t "$TMUX_SESSION"
    else
        log "Creating tmux session: $TMUX_SESSION"
        PROMPT_FILE=$(mktemp)
        get_wave_prompt > "$PROMPT_FILE"

        tmux new-session -d -s "$TMUX_SESSION" -c "$PROJECT_DIR"
        tmux send-keys -t "$TMUX_SESSION" "claude --dangerously-skip-permissions -p \"\$(cat $PROMPT_FILE)\" 2>&1 | tee -a $LOG_FILE" Enter

        log "Claude started in tmux session '$TMUX_SESSION'"
        log "To attach: tmux attach -t $TMUX_SESSION"
        log "To check logs: tail -f $LOG_FILE"

        [ "$2" = "--attach" ] && tmux attach -t "$TMUX_SESSION"
    fi

    log "=== Wave $WAVE Launcher Complete ==="
}

main "$@"
