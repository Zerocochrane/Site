#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# setup-deploy-key.sh — roda UMA vez no servidor (OCI) para permitir o deploy
# automático pelo GitHub Actions.
#
#   - instala o rsync (usado para enviar o código)
#   - cria uma chave SSH só para o deploy e autoriza ela neste usuário
#   - mostra os valores para colar nos segredos do GitHub
#
# Uso, na pasta do projeto no servidor:   bash scripts/setup-deploy-key.sh
# -----------------------------------------------------------------------------
set -euo pipefail
KEY="$HOME/.ssh/github_deploy"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

command -v rsync >/dev/null || { echo "Instalando rsync…"; sudo apt-get update -y >/dev/null; sudo apt-get install -y rsync >/dev/null; }

mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
if [ ! -f "$KEY" ]; then
  ssh-keygen -t ed25519 -N "" -C "github-actions-deploy" -f "$KEY" >/dev/null
  echo "Chave de deploy criada."
fi
touch "$HOME/.ssh/authorized_keys" && chmod 600 "$HOME/.ssh/authorized_keys"
grep -qF "$(cat "$KEY.pub")" "$HOME/.ssh/authorized_keys" || cat "$KEY.pub" >> "$HOME/.ssh/authorized_keys"

IP="$(curl -fsS -m 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
PORT="$(sshd -T 2>/dev/null | awk '/^port /{print $2; exit}')"; PORT="${PORT:-22}"

cat <<INFO

================= Cole estes valores no GitHub =================
Repositório → Settings → Secrets and variables → Actions → New repository secret

OCI_HOST         $IP
OCI_USER         $(id -un)
OCI_PATH         $ROOT
OCI_PORT         $PORT   (só precisa criar se não for 22)

OCI_KNOWN_HOSTS  (copie as linhas abaixo, inteiras)
$(HOSTFIELD="$IP"; [ "$PORT" = 22 ] || HOSTFIELD="[$IP]:$PORT"; ssh-keyscan -p "$PORT" localhost 2>/dev/null | grep -v '^#' | awk -v h="$HOSTFIELD" '{ $1 = h; print }')

OCI_SSH_KEY      (copie TUDO, de -----BEGIN até END-----)
$(cat "$KEY")
================================================================
Depois de colar, apague esta tela (clear) — a chave privada não deve ficar à vista.
INFO
