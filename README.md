# TINA SaaS

Sistema de gestão familiar com dashboard multi-perfil, controle de tarefas, agenda, time tracking, recompensas, **módulo de refeições** (planner, receitas globais, lista de compras, PWA) e painel administrativo.

## Arquitetura

```
tina1/
├── backend/          # Express + PostgreSQL (API REST)
│   └── src/
│       ├── server.js          # Ponto de entrada
│       ├── lib/db.js          # Pool, schema, seed, migrations
│       ├── lib/tokens.js      # JWT sign/verify
│       ├── lib/workspace.js   # Montagem do dashboard
│       ├── middleware/auth.js  # requireAuth + requireRole
│       └── routes/            # auth, dashboard, tasks, events, etc.
├── frontend/         # React 19 + Vite 8
│   └── src/
│       ├── pages/             # DashboardPage, SuperAdminPage, Login, Register
│       ├── components/        # UI, dashboard views, forms
│       ├── context/           # AuthContext, AppDataContext
│       └── lib/               # api.js, storage.js, seed.js
├── deploy.sh         # Build + rsync + PM2 reload na VPS
├── ecosystem.config.cjs  # PM2 cluster mode
└── vps_setup.sh      # Provisionamento do servidor
```

## Setup local

```bash
# Backend
cd backend
cp .env.example .env   # Editar DATABASE_URL e JWT_SECRET
npm install
npm run dev            # http://localhost:4000

# Frontend (outro terminal)
cd frontend
cp .env.example .env   # Ajuste VITE_API_URL (ex.: http://localhost:4000/api em dev)
npm install
npm run dev            # http://localhost:5173
```

## Repositório no GitHub

- **Nunca commite** `deploy.credentials.env`, `.env`, `backend/.env`, `frontend/.env`, bases SQLite locais nem `backend/uploads/` — já estão no `.gitignore`.
- Para publicar alterações: `git add -A && git commit -m "…" && git push origin main` (ajuste o branch remoto se necessário).
- Após clonar numa máquina nova: siga **Setup local** e, para deploy na VPS, crie de novo o `deploy.credentials.env` a partir do exemplo.

## Deploy (VPS)

1. `brew install sshpass` (macOS) ou `apt install sshpass` (Linux)
2. `cp deploy.credentials.example.env deploy.credentials.env` e coloque `SSHPASS='...'` no arquivo
3. `bash deploy.sh`

Detalhes: [docs/DEPLOY.md](docs/DEPLOY.md)

## Papéis

| Papel | Acesso |
|-------|--------|
| `super_admin` | Painel administrativo, CRUD de clientes e planos |
| `admin` | Dashboard familiar completo, gestão de perfis |
| `user` | Dashboard individual |

## Stack

- **Backend**: Node.js, Express 5, PostgreSQL, JWT, bcrypt, helmet, rate-limit
- **Frontend**: React 19, Vite 8, React Router 7
- **Infra**: PM2 (cluster), Nginx (reverse proxy + gzip), UFW
