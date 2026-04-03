#!/bin/bash
set -e
echo "================================================"
echo "  TINA SaaS - VPS Setup (PostgreSQL + PM2 + Nginx)"
echo "================================================"

# --- 1. Sistema ---
apt-get update -y
apt-get install -y curl nginx postgresql postgresql-contrib ufw

# --- 2. Node.js via NVM ---
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20
nvm alias default 20
echo "Node: $(node --version) | NPM: $(npm --version)"

# --- 3. PM2 ---
npm install -g pm2

# --- 4. PostgreSQL: criar banco e usuário ---
systemctl start postgresql
systemctl enable postgresql

PG_DB=tinadb
PG_USER=tina
PG_PASS=Tina@2024Secure!

sudo -u postgres psql -c "
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$PG_USER') THEN
    CREATE USER $PG_USER WITH PASSWORD '$PG_PASS';
  END IF;
END
\$\$;
"
sudo -u postgres psql -c "CREATE DATABASE $PG_DB OWNER $PG_USER;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $PG_DB TO $PG_USER;"

echo "PostgreSQL configurado: banco=$PG_DB usuário=$PG_USER"

# --- 5. Diretório da aplicação ---
mkdir -p /var/www/tina1

# --- 6. .env de produção ---
cat > /var/www/tina1/.env << ENV
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://${PG_USER}:${PG_PASS}@localhost:5432/${PG_DB}
DATABASE_SSL=false
JWT_SECRET=$(openssl rand -hex 32)
CORS_ORIGIN=http://187.77.59.83
ENV

echo ".env criado em /var/www/tina1/.env"

# --- 7. Nginx otimizado (gzip + cache de assets) ---
cat > /etc/nginx/sites-available/tina1 << 'NGINX'
server {
    listen 80;
    server_name _;

    # Compressão gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml+rss application/atom+xml image/svg+xml;

    # Cache longo para assets estáticos (JS/CSS com hash no nome)
    location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Proxy reverso para o Node.js
    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/tina1 /etc/nginx/sites-enabled/tina1
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx && systemctl enable nginx

# --- 8. Firewall básico ---
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo ""
echo "================================================"
echo "  Setup concluído!"
echo "  Banco: postgresql://${PG_USER}:${PG_PASS}@localhost:5432/${PG_DB}"
echo "  Node: $(node --version)"
echo "  Nginx: ativo"
echo "================================================"
