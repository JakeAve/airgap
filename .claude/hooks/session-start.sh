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

# The web sandbox ships Chromium outside Playwright's cache; point the e2e task at it.
if [ -x /opt/pw-browsers/chromium ]; then
  echo 'export CHROMIUM_PATH=/opt/pw-browsers/chromium' >> "$CLAUDE_ENV_FILE"
fi
