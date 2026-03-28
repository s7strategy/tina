import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../lib/api.js'

const currentMonth = new Date().toISOString().slice(0, 7)

const defaultMetrics = {
  totalCustomers: 0,
  activeCustomers: 0,
  dueThisWeek: 0,
  overdueCustomers: 0,
  estimatedMrrCents: 0,
}

const defaultAnalytics = {
  selectedMonth: currentMonth,
  selectedLabel: '',
  availableMonths: [],
  summary: {
    newCustomers: 0,
    lostCustomers: 0,
    netGrowth: 0,
    activeCustomers: 0,
    mrrCents: 0,
    averageTicketCents: 0,
    projectedNewCustomers: 0,
    projectedLostCustomers: 0,
    projectedNetGrowth: 0,
    projectedRevenueCents: 0,
    churnRate: 0,
  },
  charts: {
    growth: [],
    revenue: [],
    statusBreakdown: [],
  },
}

const initialFilters = {
  q: '',
  planId: '',
  status: '',
  dueFrom: '',
  dueTo: '',
  sortBy: 'createdAt',
}

function createInitialUserDraft(planId = '') {
  return {
    name: '',
    email: '',
    password: '',
    role: 'admin',
    phone: '',
    planId,
    billingAmount: '',
    billingCycle: 'monthly',
    nextDueDate: '',
    customerStatus: 'trial',
    notes: '',
  }
}

function createInitialPlanDraft() {
  return {
    name: '',
    targetAudience: '',
    description: '',
    price: '',
    billingCycle: 'monthly',
    active: true,
  }
}

function formatCurrency(valueInCents) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format((valueInCents || 0) / 100)
}

function formatDate(dateValue) {
  if (!dateValue) return 'Sem vencimento'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateValue))
}

function toDateInputValue(dateValue) {
  if (!dateValue) return ''
  return new Date(dateValue).toISOString().slice(0, 10)
}

function parseMoneyToCents(value) {
  const normalized = String(value || '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')

  const amount = Number(normalized)
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0
}

function formatTrend(value) {
  if (value > 0) return `+${value}`
  return String(value)
}

function getStatusMeta(status) {
  const map = {
    active: { label: 'Ativo', tone: 'success' },
    trial: { label: 'Trial', tone: 'info' },
    overdue: { label: 'Inadimplente', tone: 'danger' },
    cancelled: { label: 'Cancelado', tone: 'neutral' },
  }

  return map[status] || { label: status || 'Sem status', tone: 'neutral' }
}

function getDueTone(dateValue, status) {
  if (!dateValue) return 'neutral'
  if (status === 'cancelled') return 'neutral'

  const now = new Date()
  const dueDate = new Date(dateValue)
  const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return 'danger'
  if (diffDays <= 7) return 'warning'
  return 'success'
}

function getDueLabel(dateValue) {
  if (!dateValue) return 'Sem data'

  const now = new Date()
  const dueDate = new Date(dateValue)
  const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return `${Math.abs(diffDays)} dia(s) atrasado(s)`
  if (diffDays === 0) return 'Vence hoje'
  if (diffDays === 1) return 'Vence amanhã'
  return `Vence em ${diffDays} dias`
}

function getCustomerDraft(customer, fallbackPlanId = '') {
  if (!customer) return createInitialUserDraft(fallbackPlanId)

  return {
    name: customer.name || '',
    email: customer.email || '',
    password: '',
    role: customer.role || 'admin',
    phone: customer.phone || '',
    planId: customer.planId || fallbackPlanId,
    billingAmount: customer.billingAmountCents ? String(customer.billingAmountCents / 100) : '',
    billingCycle: customer.billingCycle || 'monthly',
    nextDueDate: toDateInputValue(customer.nextDueDate),
    customerStatus: customer.customerStatus || 'trial',
    notes: customer.notes || '',
  }
}

function getPlanDraft(plan) {
  if (!plan) return createInitialPlanDraft()

  return {
    name: plan.name || '',
    targetAudience: plan.targetAudience || '',
    description: plan.description || '',
    price: plan.priceCents ? String(plan.priceCents / 100) : '',
    billingCycle: plan.billingCycle || 'monthly',
    active: Boolean(plan.active),
  }
}

function SuperAdminPage() {
  const { token, logout } = useAuth()
  const [users, setUsers] = useState([])
  const [plans, setPlans] = useState([])
  const [metrics, setMetrics] = useState(defaultMetrics)
  const [analytics, setAnalytics] = useState(defaultAnalytics)
  const [filters, setFilters] = useState(initialFilters)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [userDraft, setUserDraft] = useState(createInitialUserDraft())
  const [planDraft, setPlanDraft] = useState(createInitialPlanDraft())
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [editingPlanId, setEditingPlanId] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [isEditingUser, setIsEditingUser] = useState(false)
  const [loading, setLoading] = useState(false)

  const selectedUser = useMemo(() => users.find((row) => row.id === selectedUserId) ?? null, [selectedUserId, users])
  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === editingPlanId) ?? null, [editingPlanId, plans])

  const loadData = useCallback(
    async (nextFilters = filters, nextMonth = selectedMonth) => {
      setLoading(true)
      try {
        const [usersPayload, plansPayload, analyticsPayload] = await Promise.all([
          api.listUsers(token, nextFilters),
          api.listPlans(token),
          api.adminAnalytics(token, { month: nextMonth }),
        ])

        setUsers(usersPayload.users)
        setMetrics(usersPayload.metrics || defaultMetrics)
        setPlans(plansPayload.plans)
        setAnalytics(analyticsPayload.analytics || defaultAnalytics)
        setSelectedUserId((current) => {
          if (current && usersPayload.users.some((row) => row.id === current)) return current
          return usersPayload.users[0]?.id ?? null
        })
      } catch (error) {
        setFeedback({ type: 'error', message: error.message })
      } finally {
        setLoading(false)
      }
    },
    [filters, selectedMonth, token],
  )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [loadData])

  useEffect(() => {
    if (!plans.length) return
    setUserDraft((current) => (current.planId ? current : { ...current, planId: plans[0].id }))
  }, [plans])

  function resetUserForm() {
    setIsEditingUser(false)
    setUserDraft(createInitialUserDraft(plans[0]?.id || ''))
  }

  function resetPlanForm() {
    setEditingPlanId(null)
    setPlanDraft(createInitialPlanDraft())
  }

  function handleSelectCustomer(customer) {
    setSelectedUserId(customer.id)
    setIsEditingUser(true)
    setUserDraft(getCustomerDraft(customer, plans[0]?.id || ''))
  }

  function handleSelectPlan(plan) {
    setEditingPlanId(plan.id)
    setPlanDraft(getPlanDraft(plan))
  }

  async function handleSaveUser(event) {
    event.preventDefault()
    setFeedback(null)

    const payload = {
      ...userDraft,
      billingAmountCents: parseMoneyToCents(userDraft.billingAmount),
      nextDueDate: userDraft.nextDueDate ? new Date(`${userDraft.nextDueDate}T12:00:00`).toISOString() : null,
    }

    try {
      if (isEditingUser && selectedUserId) {
        await api.updateUser(token, selectedUserId, payload)
        setFeedback({ type: 'success', message: 'Cliente atualizado com sucesso.' })
      } else {
        await api.createUser(token, payload)
        setFeedback({ type: 'success', message: 'Cliente criado com sucesso.' })
      }

      resetUserForm()
      await loadData(filters, selectedMonth)
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    }
  }

  async function handleSavePlan(event) {
    event.preventDefault()
    setFeedback(null)

    const payload = {
      ...planDraft,
      priceCents: parseMoneyToCents(planDraft.price),
    }

    try {
      if (editingPlanId) {
        await api.updatePlan(token, editingPlanId, payload)
        setFeedback({ type: 'success', message: 'Plano atualizado com sucesso.' })
      } else {
        await api.createPlan(token, payload)
        setFeedback({ type: 'success', message: 'Plano criado com sucesso.' })
      }

      resetPlanForm()
      await loadData(filters, selectedMonth)
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    }
  }

  async function handleDeleteUser(id) {
    if (!window.confirm('Tem certeza que deseja remover este cliente?')) return

    setFeedback(null)
    try {
      await api.deleteUser(token, id)
      if (id === selectedUserId) {
        resetUserForm()
      }
      await loadData(filters, selectedMonth)
      setFeedback({ type: 'success', message: 'Cliente removido com sucesso.' })
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    }
  }

  async function handleApplyFilters(event) {
    event.preventDefault()
    await loadData(filters, selectedMonth)
  }

  function handleResetFilters() {
    setFilters(initialFilters)
    void loadData(initialFilters, selectedMonth)
  }

  async function handleMonthChange(event) {
    const nextMonth = event.target.value
    setSelectedMonth(nextMonth)
    await loadData(filters, nextMonth)
  }

  const metricCards = [
    { label: 'Clientes totais', value: metrics.totalCustomers, accent: 'violet' },
    { label: 'Clientes ativos', value: metrics.activeCustomers, accent: 'emerald' },
    { label: 'Vencem na semana', value: metrics.dueThisWeek, accent: 'amber' },
    { label: 'Inadimplentes', value: metrics.overdueCustomers, accent: 'rose' },
  ]

  const growthMax = Math.max(
    1,
    ...analytics.charts.growth.flatMap((item) => [item.newCustomers || 0, item.lostCustomers || 0, Math.abs(item.netGrowth || 0)]),
  )
  const revenueMax = Math.max(1, ...analytics.charts.revenue.map((item) => item.mrrCents || 0))
  const statusMax = Math.max(1, ...analytics.charts.statusBreakdown.map((item) => item.value || 0))

  return (
    <div className="page-wrap admin-page">
      <div className="admin-hero">
        <div>
          <div className="admin-brand">
            <div className="admin-brand-logo">T</div>
            <div>
              <div className="admin-brand-name">TINA</div>
              <div className="admin-brand-tag">Central de operação e crescimento</div>
            </div>
          </div>
          <div className="admin-subtitle">
            Gestão de clientes, faturamento, retenção e planos com visão mais analítica e executiva.
          </div>
        </div>
        <div className="admin-toolbar">
          <Link className="admin-button admin-button-ghost" to="/app">
            Ir para dashboard
          </Link>
          <button className="admin-button admin-button-ghost" onClick={() => logout()}>
            Sair
          </button>
          <button className="admin-button" onClick={resetUserForm}>
            Novo cliente
          </button>
        </div>
      </div>

      {feedback ? <div className={`feedback ${feedback.type === 'success' ? 'success' : 'error'}`}>{feedback.message}</div> : null}

      <div className="admin-summary admin-summary-single">
        <div className="admin-summary-card admin-summary-highlight">
          <div className="admin-summary-head">
            <div>
              <div className="admin-section-label">Receita recorrente</div>
              <strong>{formatCurrency(analytics.summary.mrrCents || metrics.estimatedMrrCents)}</strong>
            </div>
            <div className="admin-month-picker">
              <label className="admin-section-label" htmlFor="analytics-month">
                Mês analisado
              </label>
              <select id="analytics-month" className="admin-select" value={selectedMonth} onChange={handleMonthChange}>
                {analytics.availableMonths.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="admin-summary-trend">
            <div>
              <span>Novos no mês</span>
              <strong>{analytics.summary.newCustomers}</strong>
            </div>
            <div>
              <span>Perdidos no mês</span>
              <strong>{analytics.summary.lostCustomers}</strong>
            </div>
            <div>
              <span>Crescimento líquido</span>
              <strong>{formatTrend(analytics.summary.netGrowth)}</strong>
            </div>
            <div>
              <span>Projeção próximo mês</span>
              <strong>{formatCurrency(analytics.summary.projectedRevenueCents)}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="admin-metrics">
        {metricCards.map((item) => (
          <div key={item.label} className={`admin-metric-card ${item.accent}`}>
            <div className="admin-section-label">{item.label}</div>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      <div className="admin-analytics-grid">
        <div className="admin-card">
          <div className="admin-card-head">
            <div>
              <div className="admin-section-label">Crescimento e perda</div>
              <strong>{analytics.selectedLabel || 'Análise mensal'}</strong>
            </div>
          </div>
          <div className="admin-chart-growth">
            {analytics.charts.growth.map((item) => (
              <div key={item.month} className="admin-chart-column">
                <div className="admin-chart-bars">
                  <div className="admin-chart-bar positive" style={{ height: `${(item.newCustomers / growthMax) * 100}%` }} />
                  <div className="admin-chart-bar negative" style={{ height: `${(item.lostCustomers / growthMax) * 100}%` }} />
                </div>
                <div className="admin-chart-caption">
                  <strong>{item.label}</strong>
                  <span>{formatTrend(item.netGrowth)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-head">
            <div>
              <div className="admin-section-label">Receita recorrente</div>
              <strong>Evolução do MRR</strong>
            </div>
          </div>
          <div className="admin-chart-revenue">
            {analytics.charts.revenue.map((item) => (
              <div key={item.month} className="admin-chart-column">
                <div className="admin-chart-bars single">
                  <div className="admin-chart-bar revenue" style={{ height: `${(item.mrrCents / revenueMax) * 100}%` }} />
                </div>
                <div className="admin-chart-caption">
                  <strong>{item.label}</strong>
                  <span>{formatCurrency(item.mrrCents)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-head">
            <div>
              <div className="admin-section-label">Saúde da base</div>
              <strong>Status dos clientes</strong>
            </div>
          </div>
          <div className="admin-status-list">
            {analytics.charts.statusBreakdown.map((item) => (
              <div key={item.key} className="admin-status-row">
                <div className="admin-status-row-head">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
                <div className="admin-status-track">
                  <div className={`admin-status-fill ${item.key}`} style={{ width: `${(item.value / statusMax) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="admin-kpi-grid">
            <div className="admin-kpi-card">
              <span>Ticket médio</span>
              <strong>{formatCurrency(analytics.summary.averageTicketCents)}</strong>
            </div>
            <div className="admin-kpi-card">
              <span>Churn do mês</span>
              <strong>{analytics.summary.churnRate}%</strong>
            </div>
            <div className="admin-kpi-card">
              <span>Projeção de novos</span>
              <strong>{analytics.summary.projectedNewCustomers}</strong>
            </div>
            <div className="admin-kpi-card">
              <span>Projeção de perdas</span>
              <strong>{analytics.summary.projectedLostCustomers}</strong>
            </div>
          </div>
        </div>
      </div>

      <form className="admin-filter-card" onSubmit={handleApplyFilters}>
        <div className="admin-filter-grid">
          <input
            className="admin-input"
            placeholder="Buscar por nome, e-mail ou telefone"
            value={filters.q}
            onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
          />
          <select
            className="admin-select"
            value={filters.planId}
            onChange={(event) => setFilters((current) => ({ ...current, planId: event.target.value }))}
          >
            <option value="">Todos os planos</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
          <select
            className="admin-select"
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="">Todos os status</option>
            <option value="active">Ativo</option>
            <option value="trial">Trial</option>
            <option value="overdue">Inadimplente</option>
            <option value="cancelled">Cancelado</option>
          </select>
          <select
            className="admin-select"
            value={filters.sortBy}
            onChange={(event) => setFilters((current) => ({ ...current, sortBy: event.target.value }))}
          >
            <option value="createdAt">Mais recentes</option>
            <option value="name">Nome</option>
            <option value="dueDate">Próximo vencimento</option>
          </select>
          <input
            className="admin-input"
            type="date"
            value={filters.dueFrom}
            onChange={(event) => setFilters((current) => ({ ...current, dueFrom: event.target.value }))}
          />
          <input
            className="admin-input"
            type="date"
            value={filters.dueTo}
            onChange={(event) => setFilters((current) => ({ ...current, dueTo: event.target.value }))}
          />
        </div>

        <div className="admin-filter-actions">
          <button className="admin-button admin-button-ghost" type="button" onClick={handleResetFilters}>
            Limpar filtros
          </button>
          <button className="admin-button" type="submit">
            Aplicar filtros
          </button>
        </div>
      </form>

      <div className="admin-layout">
        <div className="admin-card admin-table-card">
          <div className="admin-card-head">
            <div>
              <div className="admin-section-label">Base de clientes</div>
              <strong>{loading ? 'Atualizando...' : `${users.length} registro(s)`}</strong>
            </div>
          </div>

          {users.length > 0 ? (
            <div className="table-wrap">
              <table className="table admin-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Contato</th>
                    <th>Plano</th>
                    <th>Vencimento</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((row) => {
                    const statusMeta = getStatusMeta(row.customerStatus)
                    const dueTone = getDueTone(row.nextDueDate, row.customerStatus)

                    return (
                      <tr
                        key={row.id}
                        className={row.id === selectedUserId ? 'is-selected' : ''}
                        onClick={() => handleSelectCustomer(row)}
                      >
                        <td>
                          <div className="admin-customer-cell">
                            <strong>{row.name}</strong>
                            <span>{row.role === 'admin' ? 'Conta gestora' : 'Conta individual'}</span>
                          </div>
                        </td>
                        <td>
                          <div className="admin-customer-cell">
                            <span>{row.email}</span>
                            <span>{row.phone || 'Sem telefone'}</span>
                          </div>
                        </td>
                        <td>
                          <div className="admin-customer-cell">
                            <strong>{row.planName || 'Sem plano'}</strong>
                            <span>{formatCurrency(row.billingAmountCents)}</span>
                          </div>
                        </td>
                        <td>
                          <div className="admin-customer-cell">
                            <strong>{formatDate(row.nextDueDate)}</strong>
                            <span className={`admin-inline-badge ${dueTone}`}>{getDueLabel(row.nextDueDate)}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`admin-status-badge ${statusMeta.tone}`}>{statusMeta.label}</span>
                        </td>
                        <td>
                          <div className="admin-row-actions">
                            <button
                              className="admin-link-button"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleSelectCustomer(row)
                              }}
                            >
                              Editar
                            </button>
                            <button
                              className="admin-link-button danger"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                void handleDeleteUser(row.id)
                              }}
                            >
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">Nenhum cliente encontrado com os filtros atuais.</div>
          )}
        </div>

        <div className="admin-sidebar">
          <div className="admin-card">
            <div className="admin-card-head">
              <div>
                <div className="admin-section-label">Cliente selecionado</div>
                <strong>{selectedUser?.name || 'Nenhum cliente selecionado'}</strong>
              </div>
            </div>

            {selectedUser ? (
              <div className="admin-spotlight">
                <div>
                  <span className="admin-spotlight-label">Telefone</span>
                  <strong>{selectedUser.phone || 'Sem telefone'}</strong>
                </div>
                <div>
                  <span className="admin-spotlight-label">Plano</span>
                  <strong>{selectedUser.planName || 'Sem plano'}</strong>
                </div>
                <div>
                  <span className="admin-spotlight-label">Cobrança</span>
                  <strong>{formatCurrency(selectedUser.billingAmountCents)}</strong>
                </div>
                <div>
                  <span className="admin-spotlight-label">Próximo vencimento</span>
                  <strong>{formatDate(selectedUser.nextDueDate)}</strong>
                </div>
              </div>
            ) : (
              <div className="empty-state">Selecione um cliente para visualizar o resumo rápido.</div>
            )}
          </div>

          <div className="admin-card">
            <div className="admin-card-head">
              <div>
                <div className="admin-section-label">{isEditingUser ? 'Editar cliente' : 'Novo cliente'}</div>
                <strong>{isEditingUser ? 'Atualize acesso, plano e vencimento' : 'Cadastrar cliente com dados reais'}</strong>
              </div>
              {isEditingUser ? (
                <button className="admin-button admin-button-ghost" type="button" onClick={resetUserForm}>
                  Novo
                </button>
              ) : null}
            </div>

            <form className="admin-form" onSubmit={handleSaveUser}>
              <div className="admin-form-grid two">
                <input
                  className="admin-input"
                  placeholder="Nome completo"
                  value={userDraft.name}
                  onChange={(event) => setUserDraft((current) => ({ ...current, name: event.target.value }))}
                />
                <input
                  className="admin-input"
                  type="email"
                  placeholder="E-mail"
                  value={userDraft.email}
                  onChange={(event) => setUserDraft((current) => ({ ...current, email: event.target.value }))}
                />
              </div>

              <div className="admin-form-grid two">
                <input
                  className="admin-input"
                  placeholder="Telefone"
                  value={userDraft.phone}
                  onChange={(event) => setUserDraft((current) => ({ ...current, phone: event.target.value }))}
                />
                <input
                  className="admin-input"
                  type="password"
                  placeholder={isEditingUser ? 'Nova senha (opcional)' : 'Senha inicial'}
                  value={userDraft.password}
                  onChange={(event) => setUserDraft((current) => ({ ...current, password: event.target.value }))}
                />
              </div>

              <div className="admin-form-grid three">
                <select
                  className="admin-select"
                  value={userDraft.role}
                  onChange={(event) => setUserDraft((current) => ({ ...current, role: event.target.value }))}
                >
                  <option value="admin">Admin</option>
                  <option value="user">Usuário</option>
                </select>
                <select
                  className="admin-select"
                  value={userDraft.planId}
                  onChange={(event) => setUserDraft((current) => ({ ...current, planId: event.target.value }))}
                >
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
                <select
                  className="admin-select"
                  value={userDraft.customerStatus}
                  onChange={(event) => setUserDraft((current) => ({ ...current, customerStatus: event.target.value }))}
                >
                  <option value="active">Ativo</option>
                  <option value="trial">Trial</option>
                  <option value="overdue">Inadimplente</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>

              <div className="admin-form-grid three">
                <input
                  className="admin-input"
                  placeholder="Valor do plano"
                  value={userDraft.billingAmount}
                  onChange={(event) => setUserDraft((current) => ({ ...current, billingAmount: event.target.value }))}
                />
                <select
                  className="admin-select"
                  value={userDraft.billingCycle}
                  onChange={(event) => setUserDraft((current) => ({ ...current, billingCycle: event.target.value }))}
                >
                  <option value="monthly">Mensal</option>
                  <option value="yearly">Anual</option>
                </select>
                <input
                  className="admin-input"
                  type="date"
                  value={userDraft.nextDueDate}
                  onChange={(event) => setUserDraft((current) => ({ ...current, nextDueDate: event.target.value }))}
                />
              </div>

              <textarea
                className="admin-textarea"
                rows="4"
                placeholder="Observações administrativas"
                value={userDraft.notes}
                onChange={(event) => setUserDraft((current) => ({ ...current, notes: event.target.value }))}
              />

              <div className="admin-form-actions">
                <button className="admin-button admin-button-ghost" type="button" onClick={resetUserForm}>
                  Limpar
                </button>
                <button className="admin-button" type="submit">
                  {isEditingUser ? 'Salvar alterações' : 'Criar cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className="admin-plans-grid">
        <div className="admin-card">
          <div className="admin-card-head">
            <div>
              <div className="admin-section-label">Planos</div>
              <strong>Catálogo comercial</strong>
            </div>
          </div>

          <div className="admin-plan-cards">
            {plans.map((plan) => (
              <div key={plan.id} className={`admin-plan-card ${plan.active ? '' : 'is-muted'}`}>
                <div className="admin-plan-top">
                  <div>
                    <strong>{plan.name}</strong>
                    <span>{plan.targetAudience || 'Sem indicação de público'}</span>
                  </div>
                  <span className={`admin-status-badge ${plan.active ? 'success' : 'neutral'}`}>
                    {plan.active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="admin-plan-price">
                  {formatCurrency(plan.priceCents)}
                  <span>/{plan.billingCycle === 'yearly' ? 'ano' : 'mês'}</span>
                </div>
                <div className="admin-plan-meta">
                  <span>{plan.customerCount} cliente(s)</span>
                </div>
                <div className="admin-plan-limits">{plan.description || 'Sem observações'}</div>
                <div className="admin-plan-actions">
                  <button className="admin-button admin-button-ghost" type="button" onClick={() => handleSelectPlan(plan)}>
                    Editar plano
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-head">
            <div>
              <div className="admin-section-label">{editingPlanId ? 'Editar plano' : 'Novo plano'}</div>
              <strong>{editingPlanId ? selectedPlan?.name || 'Plano selecionado' : 'Adicionar nova oferta'}</strong>
            </div>
            {editingPlanId ? (
              <button className="admin-button admin-button-ghost" type="button" onClick={resetPlanForm}>
                Novo
              </button>
            ) : null}
          </div>

          <form className="admin-form" onSubmit={handleSavePlan}>
            <input
              className="admin-input"
              placeholder="Nome do plano"
              value={planDraft.name}
              onChange={(event) => setPlanDraft((current) => ({ ...current, name: event.target.value }))}
            />

            <input
              className="admin-input"
              placeholder="Pra quem serve"
              value={planDraft.targetAudience}
              onChange={(event) => setPlanDraft((current) => ({ ...current, targetAudience: event.target.value }))}
            />

            <textarea
              className="admin-textarea"
              rows="4"
              placeholder="Pequena observação do plano"
              value={planDraft.description}
              onChange={(event) => setPlanDraft((current) => ({ ...current, description: event.target.value }))}
            />

            <div className="admin-form-grid three">
              <input
                className="admin-input"
                placeholder="Valor"
                value={planDraft.price}
                onChange={(event) => setPlanDraft((current) => ({ ...current, price: event.target.value }))}
              />
              <select
                className="admin-select"
                value={planDraft.billingCycle}
                onChange={(event) => setPlanDraft((current) => ({ ...current, billingCycle: event.target.value }))}
              >
                <option value="monthly">Mensal</option>
                <option value="yearly">Anual</option>
              </select>
              <select
                className="admin-select"
                value={planDraft.active ? 'true' : 'false'}
                onChange={(event) => setPlanDraft((current) => ({ ...current, active: event.target.value === 'true' }))}
              >
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </div>

            <div className="admin-form-actions">
              <button className="admin-button admin-button-ghost" type="button" onClick={resetPlanForm}>
                Limpar
              </button>
              <button className="admin-button" type="submit">
                {editingPlanId ? 'Salvar plano' : 'Criar plano'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default SuperAdminPage
