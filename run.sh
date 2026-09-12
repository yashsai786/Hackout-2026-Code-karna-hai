#!/usr/bin/env bash
#
# Leakpoint — start the whole system with one command.
#
#   ./run.sh
#
# Creates what is missing, reuses what is not, and needs no API key. The web app is fully usable
# on its own; the API adds the machine-learned hotspot estimate. If either tier cannot start, the
# script says why rather than failing silently.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

API_PORT="${API_PORT:-8001}"
WEB_PORT="${WEB_PORT:-3000}"
VENV="$ROOT/.venv"
ARTEFACT="$ROOT/ai/models/hotspots.joblib"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
info() { printf '  %s\n' "$1"; }
die()  { printf '\033[31merror:\033[0m %s\n' "$1" >&2; exit 1; }

bold "Leakpoint"
echo

# ---------------------------------------------------------------- prerequisites
# scikit-learn 1.9 (which the committed model artefact is pickled by) requires Python 3.11+, so
# take the newest interpreter available rather than whatever `python3` happens to point at — on
# macOS that is often the 3.9 shipped with the Command Line Tools.
PY_BIN=""
for c in python3.13 python3.12 python3.11 python3; do
  command -v "$c" >/dev/null || continue
  if "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null; then
    PY_BIN="$c"; break
  fi
done
[ -n "$PY_BIN" ] || die "Python 3.11 or newer is required (found: $(python3 -V 2>&1 || echo none)).
  macOS:  brew install python@3.12
  Ubuntu: sudo apt install python3.12 python3.12-venv"
# npm is canonical here because package-lock.json is what we commit and what CI installs from.
if command -v npm >/dev/null; then PKG_INSTALL="npm install --silent --no-audit --no-fund"; PKG_RUN="npm run"
elif command -v yarn >/dev/null; then PKG_INSTALL="yarn install --silent"; PKG_RUN="yarn"
else die "npm is required. Install Node.js 18 or newer."; fi

# ---------------------------------------------------------------- configuration
for tier in frontend backend; do
  if [ ! -f "$tier/.env" ] && [ -f "$tier/.env.example" ]; then
    cp "$tier/.env.example" "$tier/.env"
    info "created $tier/.env from the example"
  fi
done

# ---------------------------------------------------------------- python tier
if [ ! -d "$VENV" ]; then
  info "creating the Python environment (one time, ~1 minute)"
  "$PY_BIN" -m venv "$VENV"
  "$VENV/bin/pip" install --quiet --upgrade pip
fi
info "installing Python dependencies"
"$VENV/bin/pip" install --quiet -r backend/requirements.txt

# The trained artefact is committed so a clone demonstrates offline. Retrain only if it is absent
# or unreadable — an artefact pickled by a different scikit-learn will not load, and a silent
# failure here would strip the product of its machine learning without saying so.
if ! "$VENV/bin/python" - <<PY >/dev/null 2>&1
from joblib import load; load("$ARTEFACT")
PY
then
  info "training the hotspot model (~30 seconds)"
  "$VENV/bin/pip" install --quiet -r ai/requirements.txt
  (cd ai && "$VENV/bin/python" train.py | sed 's/^/    /')
fi

# ---------------------------------------------------------------- node tier
if [ ! -d frontend/node_modules ]; then
  info "installing frontend dependencies (one time, a few minutes)"
  (cd frontend && eval "$PKG_INSTALL")
fi

# ---------------------------------------------------------------- run
cleanup() { trap - EXIT INT TERM; [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

(cd backend && "$VENV/bin/python" -m uvicorn server:app --host 127.0.0.1 --port "$API_PORT" \
  > "$ROOT/.api.log" 2>&1) &
API_PID=$!

for _ in $(seq 1 40); do
  curl -sf "http://127.0.0.1:$API_PORT/api/health" >/dev/null 2>&1 && break
  sleep 0.25
done

echo
if curl -sf "http://127.0.0.1:$API_PORT/api/health" >/dev/null 2>&1; then
  bold "  API   http://127.0.0.1:$API_PORT/api/health"
  info "model: $(curl -s "http://127.0.0.1:$API_PORT/api/health" | sed 's/.*"model_loaded":\([a-z]*\).*/\1/')"
else
  info "the API did not start — see .api.log. The web app still works; only the"
  info "machine-learned split estimate will be unavailable."
fi
bold "  Web   http://localhost:$WEB_PORT"
echo
info "Press Ctrl-C to stop both."
echo

# --port is passed explicitly: without it Vite takes FRONTEND_PORT from frontend/.env and the URL
# printed above could name a different port from the one actually served.
cd frontend && eval "$PKG_RUN start -- --port $WEB_PORT --strictPort"
