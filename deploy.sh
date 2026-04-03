#!/bin/bash
# =============================================
#  deploy.sh - Sincroniza TINA com o VPS
#  Uso: bash deploy.sh
# =============================================
set -e

VPS_HOST="root@187.77.59.83"
VPS_DIR="/var/www/tina1"

echo "🔨 [1/4] Build do frontend..."
cd "$(dirname "$0")/frontend"
npm install --silent
npm run build
cd ..

echo "📦 [2/4] Enviando arquivos para o VPS..."
SSHPASS='Futuro20242024#' sshpass -e rsync -avz --delete \
  --exclude='.git' \
  --exclude='frontend/node_modules' \
  --exclude='backend/node_modules' \
  --exclude='frontend/src' \
  --exclude='*.sqlite*' \
  --filter='protect .env' \
  --filter='protect backend/.env' \
  -e "ssh -o StrictHostKeyChecking=no" \
  ./ "$VPS_HOST:$VPS_DIR/"

echo "⚙️  [3/4] Instalando dependências e reiniciando no VPS..."
SSHPASS='Futuro20242024#' sshpass -e ssh -o StrictHostKeyChecking=no "$VPS_HOST" bash << 'REMOTE'
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

  cd /var/www/tina1

  # Garantir diretório de logs
  mkdir -p /var/log/tina

  # Instalar dependências do backend
  cd backend && npm install --production --silent && cd ..

  # Subir/Recarregar com PM2
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
SSHPASS='Futuro20242024#' sshpass -e ssh -o StrictHostKeyChecking=no "$VPS_HOST" "export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\" && pm2 list"
