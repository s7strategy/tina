#!/bin/bash
# Deploy: build frontend + rsync + PM2 no VPS.
# Senha SSH: ficheiro LOCAL deploy.credentials.env (não commitado — ver .gitignore)
#   cp deploy.credentials.example.env deploy.credentials.env
# Não partilhes a senha no chat; guarda só nesse ficheiro na tua máquina.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CRED_FILE="$SCRIPT_DIR/deploy.credentials.env"
if [ -f "$CRED_FILE" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$CRED_FILE"
  set +a
elif [ -z "${SSHPASS:-}" ]; then
  echo "Aviso: deploy.credentials.env não encontrado e SSHPASS vazio."
  echo "Se usas senha SSH: cp deploy.credentials.example.env deploy.credentials.env e preenche SSHPASS."
  echo "Se usas só chave SSH (agent), podes ignorar este aviso."
fi

VPS_HOST="${TINA_VPS_HOST:-root@187.77.59.83}"
VPS_DIR="${TINA_VPS_DIR:-/var/www/tina1}"

if [ -n "$SSHPASS" ] && ! command -v sshpass >/dev/null 2>&1; then
  echo "Erro: SSHPASS está definido mas o comando 'sshpass' não existe."
  echo "Instale: macOS: brew install sshpass  |  Ubuntu: sudo apt install sshpass"
  exit 1
fi

echo "🔨 [1/4] Build do frontend..."
cd "$SCRIPT_DIR/frontend"
npm install --silent
npm run build
cd "$SCRIPT_DIR"

echo "📦 [2/4] Enviando arquivos para o VPS..."

SSH_CMD="ssh -o StrictHostKeyChecking=accept-new"
RSYNC_CMD="rsync"

if [ -n "$SSHPASS" ]; then
  RSYNC_CMD="sshpass -e rsync"
  SSH_CMD="sshpass -e ssh -o StrictHostKeyChecking=accept-new"
fi

$RSYNC_CMD -avz --delete \
  --exclude='.git' \
  --exclude='deploy.credentials.env' \
  --exclude='frontend/node_modules' \
  --exclude='backend/node_modules' \
  --exclude='frontend/src' \
  --exclude='*.sqlite*' \
  --filter='protect .env' \
  --filter='protect backend/.env' \
  -e "$SSH_CMD" \
  ./ "$VPS_HOST:$VPS_DIR/"

echo "⚙️  [3/4] Instalando dependências e reiniciando no VPS..."
$SSH_CMD "$VPS_HOST" bash << 'REMOTE'
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

  cd /var/www/tina1

  mkdir -p /var/log/tina

  cd backend && npm install --production --silent && npm run migrate && cd ..
  # One-off: limpar forks/receitas desse utilizador e publicar strogonoff na Tina (só na 1.ª vez neste VPS)
  if [ ! -f /var/log/tina/s7-purge-recipes.done ]; then
    if ( cd backend && node scripts/once-purge-user-recipes-promote-strogonoff.js s7strategy@gmail.com ); then
      touch /var/log/tina/s7-purge-recipes.done
    fi
  fi

  if pm2 list | grep -q "tina-backend"; then
    pm2 reload ecosystem.config.cjs --update-env
  else
    pm2 start ecosystem.config.cjs
    pm2 save
    pm2 startup systemd -u root --hp /root | tail -1 | bash || true
  fi

  echo "✅ Backend rodando!"
  pm2 list
REMOTE

echo ""
echo "✅ [4/4] Deploy concluído!"
echo "🌐 Acesse: http://187.77.59.83"
echo ""
echo "📊 Status do backend:"
$SSH_CMD "$VPS_HOST" "export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\" && pm2 list"
