import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { demoAccounts } from '../lib/seed.js'

function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [form, setForm] = useState({ email: 'admin@tina.local', password: 'admin123' })
  const [feedback, setFeedback] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setFeedback('')

    try {
      const user = await login(form)
      navigate(user.role === 'super_admin' ? '/super-admin' : '/app')
    } catch (error) {
      setFeedback(error.message)
    }
  }

  function fillDemo(account) {
    setForm({ email: account.email, password: account.password })
  }

  return (
    <div className="auth-shell">
      <aside className="auth-side">
        <div>
          <div className="sb-logo">🏠</div>
          <h1>TINA agora em modo SaaS.</h1>
          <p>
            Mesmo dashboard, mesma identidade visual, agora com autenticação, persistência,
            controle de papéis e base pronta para escalar.
          </p>
          <div className="auth-badges">
            <div className="auth-badge">Login, cadastro e sessão persistida</div>
            <div className="auth-badge">Dashboard protegido por papel</div>
            <div className="auth-badge">Painel isolado de super admin</div>
          </div>
        </div>
        <div className="muted">Backend real da TINA em Express + SQLite com estrutura pronta para crescer.</div>
      </aside>

      <main className="auth-panel">
        <form className="auth-card" onSubmit={handleSubmit}>
          <div className="auth-title">Entrar</div>
          <div className="auth-subtitle">Acesse sua conta para abrir o dashboard.</div>

          {feedback ? <div className="feedback error">{feedback}</div> : null}

          <div className="auth-field">
            <label className="auth-label" htmlFor="login-email">
              E-mail
            </label>
            <input
              id="login-email"
              className="auth-input"
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="login-password">
              Senha
            </label>
            <input
              id="login-password"
              className="auth-input"
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              required
            />
          </div>

          <div className="auth-actions">
            <button className="auth-submit" type="submit">
              Entrar
            </button>
          </div>

          <div className="demo-list">
            {demoAccounts.map((account) => (
              <button
                className="demo-pill"
                type="button"
                key={account.email}
                onClick={() => fillDemo(account)}
              >
                {account.role} · {account.email}
              </button>
            ))}
          </div>

          <div className="auth-note">
            Contas seed: super admin, admin da família e usuário padrão. Você pode criar outras
            pelo cadastro ou pelo painel de super admin.
          </div>

          <div className="auth-switch">
            Ainda não tem conta?&nbsp;
            <Link className="auth-link" to="/register">
              Criar conta
            </Link>
          </div>
        </form>
      </main>
    </div>
  )
}

export default LoginPage
