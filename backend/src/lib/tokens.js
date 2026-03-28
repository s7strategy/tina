const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'tina-dev-secret'

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '7d' },
  )
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET)
}

module.exports = {
  signToken,
  verifyToken,
}
