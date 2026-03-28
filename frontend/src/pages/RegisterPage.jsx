import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

function RegisterPage() {
  const navigate = useNavigate()
  const { register } = useAuth()
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'admin',
  })
  const [feedback, setFeedback] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setFeedback('')

    try {
      const user = await register(form)
      navigate(user.role === 'super_admin' ? '/super-admin' : '/app')
    } catch (error) {
      setFeedback(error.message)
    }
  }

  return (
    <div className="auth-shell">
      <aside className="auth-side">
        <div>
          <div className="sb-logo">🏠</div>
          <h1>Cadastre um novo workspace na TINA.</h1>
          <p>
            O fluxo de registro já cria uma conta com papel, persiste sessão e habilita acesso
            protegido ao produto.
          </p>
        </div>
        <div className="auth-badges">
          <div className="auth-badge">Role `admin` para contas que gerenciam família/equipe</div>
          <div className="auth-badge">Role `user` para acesso individual</div>
        </div>
      </aside>

      <main className="auth-panel">
        <form className="auth-card" onSubmit={handleSubmit}>
          <div className="auth-title">Criar conta</div>
          <div className="auth-subtitle">Registre seu acesso e entre direto no produto.</div>

          {feedback ? <div className="feedback error">{feedback}</div> : null}

          <div className="auth-field">
            <label className="auth-label" htmlFor="register-name">
              Nome
            </label>
            <input
              id="register-name"
              className="auth-input"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="register-email">
              E-mail
            </label>
            <input
              id="register-email"
              className="auth-input"
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="register-password">
              Senha
            </label>
            <input
              id="register-password"
              className="auth-input"
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              required
              minLength={6}
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="register-role">
              Papel inicial
            </label>
            <select
              id="register-role"
              className="auth-input"
              value={form.role}
              onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
            >
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </select>
          </div>

          <button className="auth-submit" type="submit">
            Criar conta
          </button>

          <div className="auth-switch">
            Já possui conta?&nbsp;
            <Link className="auth-link" to="/login">
              Fazer login
            </Link>
          </div>
        </form>
      </main>
    </div>
  )
}

export default RegisterPage
