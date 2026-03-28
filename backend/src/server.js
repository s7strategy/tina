require('dotenv').config()

const fs = require('fs')
const path = require('path')
const express = require('express')
const cors = require('cors')
const { migrate, query, seed } = require('./lib/db')
const authRoutes = require('./routes/auth')
const dashboardRoutes = require('./routes/dashboard')
const userRoutes = require('./routes/users')
const taskRoutes = require('./routes/tasks')
const categoryRoutes = require('./routes/categories')
const planRoutes = require('./routes/plans')
const memberRoutes = require('./routes/members')
const eventRoutes = require('./routes/events')
const favoriteRoutes = require('./routes/favorites')
const mealRoutes = require('./routes/meals')
const rewardRoutes = require('./routes/rewards')
const timeEntryRoutes = require('./routes/timeEntries')

const app = express()
const PORT = Number(process.env.PORT || 4000)
const frontendDistPath = path.join(__dirname, '../../frontend/dist')
const frontendIndexPath = path.join(frontendDistPath, 'index.html')
const hasFrontendBuild = fs.existsSync(frontendIndexPath)
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true)
      }

      return callback(new Error('Origem não autorizada pelo CORS.'))
    },
    credentials: true,
  }),
)
app.use(express.json())

app.get('/api/health', async (_req, res, next) => {
  try {
    await query('SELECT 1')
    res.json({
      ok: true,
      service: 'tina-backend',
      environment: process.env.NODE_ENV || 'development',
      database: process.env.DATABASE_URL ? 'postgres' : 'pg-mem',
    })
  } catch (error) {
    next(error)
  }
})

app.use('/api/auth', authRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/users', userRoutes)
app.use('/api/tasks', taskRoutes)
app.use('/api/categories', categoryRoutes)
app.use('/api/plans', planRoutes)
app.use('/api/members', memberRoutes)
app.use('/api/events', eventRoutes)
app.use('/api/favorites', favoriteRoutes)
app.use('/api/meals', mealRoutes)
app.use('/api/rewards', rewardRoutes)
app.use('/api/time-entries', timeEntryRoutes)

if (hasFrontendBuild) {
  app.use(express.static(frontendDistPath))
  app.get('/', (_req, res) => {
    res.sendFile(frontendIndexPath)
  })
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(frontendIndexPath)
  })
} else {
  app.get('/', (_req, res) => {
    res
      .status(200)
      .send('Frontend nao encontrado em dist. Rode "npm run build --prefix frontend" ou use o Vite em localhost:5173.')
  })
}

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({ error: 'Erro interno do servidor.' })
})

async function start() {
  await migrate()
  await seed()

  app.listen(PORT, () => {
    console.log(`TINA backend rodando em http://localhost:${PORT}`)
  })
}

start().catch((error) => {
  console.error('Falha ao iniciar backend:', error)
  process.exit(1)
})
