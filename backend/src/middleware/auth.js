const { getRoleByUserId } = require('../lib/db')
const { verifyToken } = require('../lib/tokens')

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (!token) {
      return res.status(401).json({ error: 'Token ausente.' })
    }

    const payload = verifyToken(token)
    const user = await getRoleByUserId(payload.sub)

    if (!user) {
      return res.status(401).json({ error: 'Usuário inválido.' })
    }

    req.user = user
    next()
  } catch (error) {
    return res.status(401).json({ error: 'Sessão inválida.' })
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso negado.' })
    }
    next()
  }
}

module.exports = {
  requireAuth,
  requireRole,
}
