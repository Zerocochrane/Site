#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# diagnose.sh — checks why the site can't be reached and prints a short report.
# Usage (on the server, from the project folder):   bash scripts/diagnose.sh
# Nothing is changed; it only reads.
# -----------------------------------------------------------------------------
APP_NAME="photo-portfolio"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ok()   { printf '\033[1;32m✔\033[0m  %s\n' "$*"; }
bad()  { printf '\033[1;31m✘\033[0m  %s\n' "$*"; PROBLEMS=$((PROBLEMS+1)); }
note() { printf '\033[1;33m!\033[0m  %s\n' "$*"; }
head_(){ printf '\n\033[1;34m== %s\033[0m\n' "$*"; }
PROBLEMS=0

env_get() { [ -f server/.env ] && grep -E "^$1=" server/.env | tail -n1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/' | tr -d '\r'; }
PORT="$(env_get PORT)"; PORT="${PORT:-4000}"

head_ "System"
. /etc/os-release 2>/dev/null; echo "   ${PRETTY_NAME:-unknown}"
if command -v node >/dev/null; then
  echo "   Node $(node -v)"
  [ "$(node -v | sed -E 's/^v([0-9]+).*/\1/')" -ge 24 ] && ok "Node 24 or newer" || bad "Node is older than 24 — run: bash scripts/install-pm2.sh"
else bad "Node is not installed"; fi

head_ "PM2 process"
if command -v pm2 >/dev/null; then
  pm2 describe "$APP_NAME" >/dev/null 2>&1 || bad "PM2 has no process called $APP_NAME — run: bash scripts/deploy-pm2.sh"
  STATUS="$(pm2 jlist 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s||'[]').find(x=>x.name==='$APP_NAME');if(!p)return;console.log([p.pm2_env.status,p.pm2_env.restart_time,Math.round((Date.now()-p.pm2_env.pm_uptime)/1000)].join(' '))})" 2>/dev/null)"
  if [ -n "$STATUS" ]; then
    read -r ST RESTARTS UPTIME <<<"$STATUS"
    echo "   status=$ST  restarts=$RESTARTS  uptime=${UPTIME}s"
    [ "$ST" = "online" ] && ok "Process is online" || bad "Process is $ST"
    if [ "$RESTARTS" -gt 3 ] && [ "$UPTIME" -lt 60 ]; then bad "It keeps crashing and restarting (see the error log below)"; fi
  fi
else bad "PM2 is not installed"; fi

head_ "Last errors from the app"
if [ -s logs/error.log ]; then tail -n 15 logs/error.log | sed 's/^/   /'; else echo "   (no errors logged)"; fi

head_ "Is the app answering on this server?"
if curl -fsS -m 5 "http://127.0.0.1:${PORT}/api/settings" >/dev/null 2>&1; then ok "Yes — http://127.0.0.1:${PORT} works on the server itself"
else bad "No answer on http://127.0.0.1:${PORT} — the app itself is not running correctly (check the errors above)"; fi
if curl -fsS -m 5 "http://127.0.0.1:${PORT}/" 2>/dev/null | grep -q '<div id="root"'; then ok "The website (built React app) is being served"
else note "The API answers but the website page is not served — run: bash scripts/deploy-pm2.sh (it builds client/dist)"; fi

head_ "Which address/port is it listening on?"
LISTEN="$(ss -ltnp 2>/dev/null | grep -E ":${PORT}\b")"
if ! command -v ss >/dev/null; then note "ss not available — skipping this check"
elif [ -n "$LISTEN" ]; then echo "$LISTEN" | sed 's/^/   /'
  echo "$LISTEN" | grep -qE "127\.0\.0\.1:${PORT}|\[::1\]:${PORT}" && ! echo "$LISTEN" | grep -qE "(\*|0\.0\.0\.0|\[::\]):${PORT}" \
    && bad "It only listens on localhost — other computers can't reach it"
else bad "Nothing is listening on port ${PORT}"; fi
if ss -ltn 2>/dev/null | grep -qE ":80\b"; then note "Something is listening on port 80 (Nginx/Apache?)"; else note "Nothing on port 80: open the site WITH the port, e.g. http://<server-ip>:${PORT}"; fi

head_ "Firewall"
if command -v ufw >/dev/null; then
  UFW="$(sudo -n ufw status 2>/dev/null || ufw status 2>/dev/null)"
  if [ -z "$UFW" ]; then note "Could not read ufw status (run this script with sudo to check)"
  elif echo "$UFW" | grep -q "Status: active"; then
    if echo "$UFW" | grep -qE "^${PORT}(/tcp)?\s+ALLOW"; then ok "ufw allows port ${PORT}"
    else bad "ufw is active and blocks port ${PORT} — fix: sudo ufw allow ${PORT}/tcp"; fi
  else ok "ufw is inactive"; fi
fi
note "If this is a cloud server (AWS, Azure, Google Cloud, Oracle, Hetzner…), the provider's firewall /"
note "security group must also allow TCP port ${PORT} (or 80/443 if you use a web server in front)."

head_ "Addresses to try from your computer"
for ip in $(hostname -I 2>/dev/null); do echo "   http://${ip}:${PORT}"; done
PUB="$(curl -fsS -m 4 https://api.ipify.org 2>/dev/null)"; [ -n "$PUB" ] && echo "   http://${PUB}:${PORT}   (public IP)"

echo
[ "$PROBLEMS" -eq 0 ] && ok "No problem found on the server itself — check the cloud firewall and that you use the :${PORT} in the address." \
  || bad "$PROBLEMS problem(s) found — see the ✘ lines above."
