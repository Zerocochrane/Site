#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# install-pm2.sh — prepares an Ubuntu 26.04 LTS server to run the portfolio.
#
#   - Installs Node.js 24 (from NodeSource; replaces older/other Node versions)
#   - Installs build tools (only used if a native module ever has to compile)
#   - Installs PM2 globally, registers it with systemd (starts on boot)
#   - Enables PM2 log rotation
#
# Usage (as your normal user, NOT root — sudo is used where needed):
#   bash scripts/install-pm2.sh
# -----------------------------------------------------------------------------
set -euo pipefail

NODE_MAJOR=24
TARGET_UBUNTU="26.04"

info()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m✔\033[0m  %s\n' "$*"; }
warn()  { printf '\033[1;33m!\033[0m  %s\n' "$*"; }
fail()  { printf '\033[1;31m✘\033[0m  %s\n' "$*" >&2; exit 1; }

# 0. Checks -------------------------------------------------------------------
[ -r /etc/os-release ] || fail "Cannot read /etc/os-release."
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || fail "This script is for Ubuntu ${TARGET_UBUNTU} (found: ${PRETTY_NAME:-unknown})."
if [ "${VERSION_ID:-}" != "$TARGET_UBUNTU" ]; then
  warn "Made for Ubuntu ${TARGET_UBUNTU}; this is ${PRETTY_NAME}. Continuing anyway…"
fi
case "$(uname -m)" in x86_64|aarch64) ;; *) fail "Unsupported CPU architecture: $(uname -m) (need x86_64 or arm64)." ;; esac

if [ "$(id -u)" -eq 0 ]; then
  [ -n "${SUDO_USER:-}" ] || warn "Running as root: PM2 will run as root. Prefer running as a normal user with sudo."
  SUDO=""
else
  command -v sudo >/dev/null || fail "This script needs sudo."
  SUDO="sudo"
fi
RUN_USER="${SUDO_USER:-$(id -un)}"
RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"
info "${PRETTY_NAME} ($(uname -m)) — the site will run as user: $RUN_USER"

# 1. Base packages ------------------------------------------------------------
info "Installing base packages…"
$SUDO apt-get update -y
$SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y curl ca-certificates gnupg build-essential python3
ok "Base packages ready"

# 2. Node.js 24 ---------------------------------------------------------------
current_major() { node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0; }

if command -v node >/dev/null && [ "$(current_major)" = "$NODE_MAJOR" ]; then
  ok "Node.js $(node -v) already installed"
else
  command -v node >/dev/null && warn "Found Node.js $(node -v) — replacing it with Node.js ${NODE_MAJOR}."
  info "Adding the NodeSource repository for Node.js ${NODE_MAJOR}…"
  $SUDO install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | $SUDO gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    | $SUDO tee /etc/apt/sources.list.d/nodesource.list >/dev/null
  # Prefer NodeSource over Ubuntu's own (different version) nodejs package
  printf 'Package: nodejs\nPin: origin deb.nodesource.com\nPin-Priority: 1001\n' | $SUDO tee /etc/apt/preferences.d/nodejs >/dev/null
  $SUDO apt-get update -y
  $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
  hash -r
  [ "$(current_major)" = "$NODE_MAJOR" ] || fail "Expected Node.js ${NODE_MAJOR}, got $(node -v 2>/dev/null || echo none). Check 'apt-cache policy nodejs'."
  ok "Node.js $(node -v) installed (npm $(npm -v))"
fi
command -v npm >/dev/null || fail "npm not found after installing Node.js."

# 3. PM2 ----------------------------------------------------------------------
info "Installing PM2…"
$SUDO npm install -g pm2@latest --no-audit --no-fund
hash -r
ok "PM2 $(pm2 -v 2>/dev/null | tail -n1) installed"

# If Node was upgraded, refresh PM2's in-memory daemon for this user
if [ "$(id -un)" = "$RUN_USER" ]; then pm2 update >/dev/null 2>&1 || true
else $SUDO -u "$RUN_USER" -H pm2 update >/dev/null 2>&1 || true; fi

# 4. Start PM2 on boot (systemd) ---------------------------------------------
info "Registering PM2 to start on boot…"
$SUDO env PATH="$PATH:$(dirname "$(command -v node)")" \
  "$(command -v pm2)" startup systemd -u "$RUN_USER" --hp "$RUN_HOME" >/dev/null
ok "PM2 starts automatically as '$RUN_USER' (service pm2-$RUN_USER)"

# 5. Log rotation -------------------------------------------------------------
info "Installing pm2-logrotate…"
if [ "$(id -un)" = "$RUN_USER" ]; then
  pm2 install pm2-logrotate >/dev/null 2>&1 && ok "Log rotation enabled" || warn "Could not install pm2-logrotate (optional)"
else
  $SUDO -u "$RUN_USER" -H pm2 install pm2-logrotate >/dev/null 2>&1 && ok "Log rotation enabled" || warn "Could not install pm2-logrotate (optional)"
fi

# 6. Firewall hint ------------------------------------------------------------
if command -v ufw >/dev/null && $SUDO ufw status 2>/dev/null | grep -q "Status: active"; then
  warn "ufw is active: allow the site's port (default 4000) with:  sudo ufw allow 4000/tcp"
  warn "(or better: put Nginx/Caddy with HTTPS in front and allow only 80/443)"
fi

echo
ok "Server is ready. Next step, from the project folder:  bash scripts/deploy-pm2.sh"
