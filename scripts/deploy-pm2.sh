#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# deploy-pm2.sh — installs dependencies, builds the website and (re)starts it
# under PM2. Safe to run again after every update of the code.
#
# Usage:   bash scripts/deploy-pm2.sh
# Run it as the same (non-root) user that ran install-pm2.sh.
# -----------------------------------------------------------------------------
set -euo pipefail

APP_NAME="photo-portfolio"

info()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m✔\033[0m  %s\n' "$*"; }
warn()  { printf '\033[1;33m!\033[0m  %s\n' "$*"; }
fail()  { printf '\033[1;31m✘\033[0m  %s\n' "$*" >&2; exit 1; }

# Always work from the project root (the folder above scripts/)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
info "Project folder: $ROOT"

command -v node >/dev/null || fail "Node.js is not installed. Run: bash scripts/install-pm2.sh"
NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
[ "$NODE_MAJOR" -ge 24 ] || fail "This project needs Node.js 24 (found $(node -v)). Run: bash scripts/install-pm2.sh"
command -v pm2  >/dev/null || fail "PM2 is not installed. Run: bash scripts/install-pm2.sh"

# Fix Windows line endings in case the project was copied from a Windows PC
for f in server/.env server/.env.example scripts/*.sh; do
  [ -f "$f" ] && sed -i 's/\r$//' "$f"
done

# 1. Configuration ------------------------------------------------------------
if [ ! -f server/.env ]; then
  cp server/.env.example server/.env
  warn "Created server/.env from the example."
  fail "Edit server/.env (ADMIN_PASSWORD, TOKEN_SECRET, PHOTOGRAPHER_EMAIL, SMTP_*) and run this script again."
fi
env_get() { grep -E "^$1=" server/.env | tail -n1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/'; }

[ "$(env_get ADMIN_PASSWORD)" = "change-me" ] && fail "Please set a real ADMIN_PASSWORD in server/.env first."
case "$(env_get TOKEN_SECRET)" in
  ""|replace-with-a-long-random-string) fail "Please set TOKEN_SECRET in server/.env first." ;;
esac
PORT="$(env_get PORT)"; PORT="${PORT:-4000}"
ok "Configuration looks good (port $PORT)"

mkdir -p server/data server/uploads server/private logs

# 2. Dependencies + build -----------------------------------------------------
# node_modules copied from Windows (or built for another Node version) contain the
# wrong native binaries for sharp — start clean in that case.
native_ok() { (cd server && node -e "new (require('node:sqlite').DatabaseSync)(':memory:'); require('sharp')") >/dev/null 2>&1; }
if [ -d server/node_modules ] && ! native_ok; then
  warn "server/node_modules does not work on this machine (copied from Windows or another Node version) — reinstalling."
  rm -rf server/node_modules
fi
[ -d client/node_modules ] && [ ! -x client/node_modules/.bin/vite ] && rm -rf client/node_modules

info "Installing server dependencies…"
npm install --prefix server --omit=dev --no-audit --no-fund
native_ok || fail "SQLite/sharp failed to load on Node $(node -v). See the npm output above."
ok "Server dependencies ready (Node $(node -v))"

info "Installing client dependencies and building the website…"
npm install --prefix client --no-audit --no-fund
npm run build --prefix client
ok "Website built (client/dist)"

# 3. Start / reload with PM2 --------------------------------------------------
info "Starting $APP_NAME with PM2…"
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save >/dev/null
ok "PM2 process list saved (survives reboots)"

# 4. Health check -------------------------------------------------------------
info "Checking the site responds…"
for i in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/settings" >/dev/null 2>&1; then
    echo
    ok "Portfolio is live on http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo localhost):${PORT}"
    echo "   Admin:   /admin"
    echo "   Logs:    pm2 logs $APP_NAME"
    echo "   Status:  pm2 status"
    echo "   Restart: pm2 restart $APP_NAME"
    exit 0
  fi
  sleep 1
done
pm2 logs "$APP_NAME" --lines 30 --nostream || true
fail "The app did not respond on port $PORT. See the logs above."
