#!/bin/bash
# Installs Deno for Claude Code on the web sessions so the git hooks, checks,
# and tests can run. Deno's own installer is blocked by the web sandbox's
# network policy, so the npm distribution is used instead.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

if ! command -v deno >/dev/null 2>&1; then
  npm install -g deno
fi

deno --version
deno install
deno task setup
