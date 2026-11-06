#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# setup-deploy-key.sh — roda UMA vez no servidor (OCI) para permitir o deploy
# automático pelo GitHub Actions.
#
#   - instala o rsync (usado para enviar o código)
#   - cria uma chave SSH só para o deploy e autoriza ela neste usuário
#   - mostra os valores para colar nos segredos do GitHub
#
# Uso, na pasta do projeto no servidor (como o usuário normal, sem sudo):
#   bash scripts/setup-deploy-key.sh
# -----------------------------------------------------------------------------
set -u   # (sem "set -e": um comando opcional que falha não pode encerrar o script em silêncio)

KEY="$HOME/.ssh/github_deploy"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
say()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✘\033[0m  %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] && [ -z "${SUDO_USER:-}" ] && echo "Aviso: rodando como root — o deploy vai entrar como root. Prefira o seu usuário normal."

# 1. rsync
if ! command -v rsync >/dev/null; then
  say "Instalando rsync…"
  sudo apt-get update -y >/dev/null 2>&1
  sudo apt-get install -y rsync >/dev/null 2>&1 || fail "Não consegui instalar o rsync. Rode: sudo apt-get install -y rsync"
fi
say "rsync: ok"

# 2. Chave de deploy
command -v ssh-keygen >/dev/null || fail "ssh-keygen não encontrado (pacote openssh-client)."
mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
if [ ! -f "$KEY" ]; then
  ssh-keygen -t ed25519 -N "" -C "github-actions-deploy" -f "$KEY" >/dev/null || fail "Não consegui criar a chave em $KEY"
  say "Chave de deploy criada: $KEY"
else
  say "Chave de deploy já existia: $KEY"
fi
touch "$HOME/.ssh/authorized_keys" && chmod 600 "$HOME/.ssh/authorized_keys"
if ! grep -qF "$(cat "$KEY.pub")" "$HOME/.ssh/authorized_keys"; then
  cat "$KEY.pub" >> "$HOME/.ssh/authorized_keys"
fi
say "Chave autorizada em ~/.ssh/authorized_keys"

# 3. Dados do servidor
IP="$(curl -fsS -m 5 https://api.ipify.org 2>/dev/null)"
[ -n "$IP" ] || IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -n "$IP" ] || IP="(IP público do servidor — veja no painel da Oracle Cloud)"

# Porta SSH: lida da configuração (não precisa de root); padrão 22
PORT="$(cat /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null | awk 'tolower($1)=="port"{p=$2} END{print p}')"
PORT="${PORT:-22}"

# known_hosts a partir das chaves públicas do próprio servidor (arquivos legíveis por todos)
HOSTFIELD="$IP"; [ "$PORT" = "22" ] || HOSTFIELD="[$IP]:$PORT"
KNOWN=""
for f in /etc/ssh/ssh_host_ed25519_key.pub /etc/ssh/ssh_host_ecdsa_key.pub /etc/ssh/ssh_host_rsa_key.pub; do
  [ -r "$f" ] && KNOWN+="$HOSTFIELD $(awk '{print $1, $2}' "$f")"$'\n'
done
[ -n "$KNOWN" ] || KNOWN="(não encontrei as chaves do servidor — pode deixar OCI_KNOWN_HOSTS sem criar)"

echo
echo "================= Cole estes valores no GitHub ================="
echo "Repositório → Settings → Secrets and variables → Actions → New repository secret"
echo
echo "OCI_HOST:"
echo "$IP"
echo
echo "OCI_USER:"
id -un
echo
echo "OCI_PATH:"
echo "$ROOT"
echo
if [ "$PORT" != "22" ]; then
  echo "OCI_PORT:"
  echo "$PORT"
  echo
fi
echo "OCI_KNOWN_HOSTS (todas as linhas abaixo):"
printf '%s' "$KNOWN"
echo
echo "OCI_SSH_KEY (copie TUDO, da linha -----BEGIN até a linha -----END):"
cat "$KEY"
echo "================================================================"
echo "Depois de colar no GitHub, rode: clear   (para a chave não ficar na tela)"
