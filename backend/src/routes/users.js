const express = require('express')
const bcrypt = require('bcryptjs')
const { one, many, query, transaction, initializeCustomerAccountForUser, initializeWorkspaceForUser, uid } = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')

const router = express.Router()

const baseSelect = `
  SELECT
    users.id,
    users.name,
    users.email,
    users.status,
    users.created_at AS "createdAt",
    roles.key AS role,
    customer_accounts.phone AS phone,
    customer_accounts.plan_id AS "planId",
    customer_accounts.billing_amount_cents AS "billingAmountCents",
    customer_accounts.billing_cycle AS "billingCycle",
    customer_accounts.next_due_date AS "nextDueDate",
    customer_accounts.customer_status AS "customerStatus",
    customer_accounts.status_changed_at AS "statusChangedAt",
    customer_accounts.cancelled_at AS "cancelledAt",
    customer_accounts.notes AS notes,
    customer_accounts.created_by_super_admin AS "createdBySuperAdmin",
    plans.name AS "planName",
    plans.target_audience AS "planTargetAudience"
  FROM users
  JOIN roles ON roles.id = users.role_id
  LEFT JOIN customer_accounts ON customer_accounts.user_id = users.id
  LEFT JOIN plans ON plans.id = customer_accounts.plan_id
`

function serializeCustomer(row) {
  return {
    ...row,
    createdBySuperAdmin: Boolean(row.createdBySuperAdmin),
    billingAmountCents: Number(row.billingAmountCents || 0),
  }
}

function toMonthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function createUtcDate(year, monthIndex, day = 1) {
  return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0))
}

function getMonthBounds(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  const start = createUtcDate(year, month - 1, 1)
  const end = createUtcDate(year, month, 0)
  end.setUTCHours(23, 59, 59, 999)
  return { start, end }
}

function shiftMonth(monthKey, diff) {
  const [year, month] = monthKey.split('-').map(Number)
  const next = createUtcDate(year, month - 1 + diff, 1)
  return toMonthKey(next)
}

function getMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    createUtcDate(year, month - 1, 1),
  )
}

function getAvailableMonths(baseMonthKey, count = 12) {
  return Array.from({ length: count }, (_value, index) => {
    const value = shiftMonth(baseMonthKey, -(count - 1) + index)
    return { value, label: getMonthLabel(value) }
  })
}

function isWithinMonth(dateValue, monthKey) {
  if (!dateValue) return false
  const date = new Date(dateValue)
  const { start, end } = getMonthBounds(monthKey)
  return date >= start && date <= end
}

function getMonthlyAmount(customer) {
  if (!customer.billingAmountCents) return 0
  return customer.billingCycle === 'yearly'
    ? Math.round(customer.billingAmountCents / 12)
    : customer.billingAmountCents
}

function isCustomerActiveAt(customer, monthKey) {
  const { end } = getMonthBounds(monthKey)
  const createdAt = new Date(customer.createdAt)
  if (createdAt > end) return false
  if (customer.cancelledAt && new Date(customer.cancelledAt) <= end) return false
  return true
}

async function listCustomers(filters = {}) {
  const conditions = [`roles.key != 'super_admin'`]
  const params = []
  let parameterIndex = 1

  if (filters.q) {
    conditions.push(`(
      users.name ILIKE $${parameterIndex} OR
      users.email ILIKE $${parameterIndex + 1} OR
      COALESCE(customer_accounts.phone, '') ILIKE $${parameterIndex + 2}
    )`)
    const term = `%${filters.q.trim()}%`
    params.push(term, term, term)
    parameterIndex += 3
  }

  if (filters.planId) {
    conditions.push(`customer_accounts.plan_id = $${parameterIndex}`)
    params.push(filters.planId)
    parameterIndex += 1
  }

  if (filters.status) {
    conditions.push(`customer_accounts.customer_status = $${parameterIndex}`)
    params.push(filters.status)
    parameterIndex += 1
  }

  if (filters.dueFrom) {
    conditions.push(`customer_accounts.next_due_date::date >= $${parameterIndex}::date`)
    params.push(filters.dueFrom)
    parameterIndex += 1
  }

  if (filters.dueTo) {
    conditions.push(`customer_accounts.next_due_date::date <= $${parameterIndex}::date`)
    params.push(filters.dueTo)
    parameterIndex += 1
  }

  const orderByMap = {
    createdAt: 'users.created_at DESC',
    name: 'LOWER(users.name) ASC',
    dueDate: 'customer_accounts.next_due_date ASC NULLS LAST, users.created_at DESC',
  }

  return (await many(
    `
      ${baseSelect}
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderByMap[filters.sortBy] || orderByMap.createdAt}
    `,
    params,
  )).map(serializeCustomer)
}

async function getCustomerById(id) {
  const row = await one(
    `
      ${baseSelect}
      WHERE users.id = $1
      LIMIT 1
    `,
    [id],
  )

  return row ? serializeCustomer(row) : null
}

function buildMetrics(customers) {
  const now = new Date()
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const estimatedMrr = customers.reduce((total, customer) => {
    if (customer.customerStatus === 'cancelled') return total
    return total + getMonthlyAmount(customer)
  }, 0)

  return {
    totalCustomers: customers.length,
    activeCustomers: customers.filter((customer) => customer.customerStatus === 'active').length,
    dueThisWeek: customers.filter((customer) => {
      if (!customer.nextDueDate) return false
      const dueDate = new Date(customer.nextDueDate)
      return dueDate >= now && dueDate <= weekAhead
    }).length,
    overdueCustomers: customers.filter((customer) => {
      if (!customer.nextDueDate) return false
      return new Date(customer.nextDueDate) < now && customer.customerStatus !== 'cancelled'
    }).length,
    estimatedMrrCents: Math.round(estimatedMrr),
  }
}

function buildAnalytics(customers, selectedMonth) {
  const activeAtMonthEnd = customers.filter((customer) => isCustomerActiveAt(customer, selectedMonth))
  const activeMrr = activeAtMonthEnd.reduce((sum, customer) => sum + getMonthlyAmount(customer), 0)
  const newCustomers = customers.filter((customer) => isWithinMonth(customer.createdAt, selectedMonth)).length
  const lostCustomers = customers.filter((customer) => isWithinMonth(customer.cancelledAt, selectedMonth)).length
  const netGrowth = newCustomers - lostCustomers
  const averageTicketCents = activeAtMonthEnd.length ? Math.round(activeMrr / activeAtMonthEnd.length) : 0

  const { end } = getMonthBounds(selectedMonth)
  const now = new Date()
  const selectedIsCurrentMonth = toMonthKey(now) === selectedMonth
  const elapsedDays = selectedIsCurrentMonth ? now.getUTCDate() : end.getUTCDate()
  const nextMonthKey = shiftMonth(selectedMonth, 1)
  const nextMonthDays = getMonthBounds(nextMonthKey).end.getUTCDate()
  const projectedNewCustomers = elapsedDays ? Math.round((newCustomers / elapsedDays) * nextMonthDays) : 0
  const projectedLostCustomers = elapsedDays ? Math.round((lostCustomers / elapsedDays) * nextMonthDays) : 0
  const projectedNetGrowth = projectedNewCustomers - projectedLostCustomers
  const projectedRevenueCents = Math.max(0, activeMrr + projectedNetGrowth * averageTicketCents)

  const growth = Array.from({ length: 6 }, (_value, index) => shiftMonth(selectedMonth, -5 + index)).map((monthKey) => {
    const added = customers.filter((customer) => isWithinMonth(customer.createdAt, monthKey)).length
    const lost = customers.filter((customer) => isWithinMonth(customer.cancelledAt, monthKey)).length
    return {
      month: monthKey,
      label: getMonthLabel(monthKey),
      newCustomers: added,
      lostCustomers: lost,
      netGrowth: added - lost,
    }
  })

  const revenue = Array.from({ length: 6 }, (_value, index) => shiftMonth(selectedMonth, -5 + index)).map((monthKey) => ({
    month: monthKey,
    label: getMonthLabel(monthKey),
    mrrCents: customers
      .filter((customer) => isCustomerActiveAt(customer, monthKey))
      .reduce((sum, customer) => sum + getMonthlyAmount(customer), 0),
  }))

  const statusBreakdown = [
    { key: 'active', label: 'Ativos', value: activeAtMonthEnd.filter((customer) => customer.customerStatus === 'active').length },
    { key: 'trial', label: 'Trial', value: activeAtMonthEnd.filter((customer) => customer.customerStatus === 'trial').length },
    { key: 'overdue', label: 'Inadimplentes', value: activeAtMonthEnd.filter((customer) => customer.customerStatus === 'overdue').length },
    { key: 'cancelled', label: 'Cancelados', value: customers.filter((customer) => isWithinMonth(customer.cancelledAt, selectedMonth)).length },
  ]

  return {
    selectedMonth,
    selectedLabel: getMonthLabel(selectedMonth),
    availableMonths: getAvailableMonths(toMonthKey(new Date())),
    summary: {
      newCustomers,
      lostCustomers,
      netGrowth,
      activeCustomers: activeAtMonthEnd.length,
      mrrCents: activeMrr,
      averageTicketCents,
      projectedNewCustomers,
      projectedLostCustomers,
      projectedNetGrowth,
      projectedRevenueCents,
      churnRate: activeAtMonthEnd.length ? Number(((lostCustomers / activeAtMonthEnd.length) * 100).toFixed(1)) : 0,
    },
    charts: {
      growth,
      revenue,
      statusBreakdown,
    },
  }
}

router.use(requireAuth, requireRole(['super_admin']))

router.get('/', async (req, res) => {
  const filters = {
    q: req.query.q || '',
    planId: req.query.planId || '',
    status: req.query.status || '',
    dueFrom: req.query.dueFrom || '',
    dueTo: req.query.dueTo || '',
    sortBy: req.query.sortBy || 'createdAt',
  }

  const users = await listCustomers(filters)
  res.json({ users, metrics: buildMetrics(users) })
})

router.get('/analytics', async (req, res) => {
  const selectedMonth = req.query.month || toMonthKey(new Date())
  const customers = await listCustomers({ sortBy: 'createdAt' })
  res.json({ analytics: buildAnalytics(customers, selectedMonth) })
})

router.post('/', async (req, res) => {
  const {
    name,
    email,
    password,
    role = 'user',
    phone = '',
    planId = 'plan-starter',
    billingAmountCents = 0,
    billingCycle = 'monthly',
    nextDueDate = null,
    customerStatus = 'trial',
    notes = '',
  } = req.body

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' })
  }

  const existing = await one('SELECT id FROM users WHERE email = $1', [email])
  if (existing) {
    return res.status(409).json({ error: 'Este e-mail já está cadastrado.' })
  }

  const roleRow = await one('SELECT id FROM roles WHERE key = $1', [role])
  if (!roleRow) {
    return res.status(400).json({ error: 'Papel inválido.' })
  }

  if (planId) {
    const planRow = await one('SELECT id FROM plans WHERE id = $1', [planId])
    if (!planRow) {
      return res.status(400).json({ error: 'Plano inválido.' })
    }
  }

  const id = uid('user')
  await transaction(async (client) => {
    await query(
      `
        INSERT INTO users (id, name, email, password_hash, role_id, status, created_at)
        VALUES ($1, $2, $3, $4, $5, 'active', $6)
      `,
      [id, name, email, bcrypt.hashSync(password, 10), roleRow.id, new Date().toISOString()],
      client,
    )

    await initializeWorkspaceForUser(
      id,
      name,
      {
        phone,
        planId,
        billingAmountCents,
        billingCycle,
        nextDueDate,
        customerStatus,
        notes,
        createdBySuperAdmin: true,
      },
      client,
    )
  })

  const user = await getCustomerById(id)
  res.status(201).json({ user })
})

router.patch('/:id', async (req, res) => {
  const { id } = req.params
  const existing = await getCustomerById(id)

  if (!existing) {
    return res.status(404).json({ error: 'Usuário não encontrado.' })
  }

  const {
    name = existing.name,
    email = existing.email,
    role = existing.role,
    phone = existing.phone || '',
    planId = existing.planId || 'plan-starter',
    billingAmountCents = existing.billingAmountCents || 0,
    billingCycle = existing.billingCycle || 'monthly',
    nextDueDate = existing.nextDueDate || null,
    customerStatus = existing.customerStatus || 'trial',
    notes = existing.notes || '',
    password = '',
  } = req.body

  const emailRow = await one('SELECT id FROM users WHERE email = $1 AND id != $2', [email, id])
  if (emailRow) {
    return res.status(409).json({ error: 'Este e-mail já está cadastrado em outro usuário.' })
  }

  const roleRow = await one('SELECT id FROM roles WHERE key = $1', [role])
  if (!roleRow) {
    return res.status(400).json({ error: 'Papel inválido.' })
  }

  if (planId) {
    const planRow = await one('SELECT id FROM plans WHERE id = $1', [planId])
    if (!planRow) {
      return res.status(400).json({ error: 'Plano inválido.' })
    }
  }

  await initializeCustomerAccountForUser(id)

  if (password) {
    await query(
      `
        UPDATE users
        SET name = $1, email = $2, role_id = $3, password_hash = $4
        WHERE id = $5
      `,
      [name, email, roleRow.id, bcrypt.hashSync(password, 10), id],
    )
  } else {
    await query(
      `
        UPDATE users
        SET name = $1, email = $2, role_id = $3
        WHERE id = $4
      `,
      [name, email, roleRow.id, id],
    )
  }

  const now = new Date().toISOString()
  const statusChanged = customerStatus !== existing.customerStatus
  const cancelledAt = customerStatus === 'cancelled' ? existing.cancelledAt || now : null

  await query(
    `
      UPDATE customer_accounts
      SET
        phone = $1,
        company_name = '',
        plan_id = $2,
        billing_amount_cents = $3,
        billing_cycle = $4,
        next_due_date = $5,
        customer_status = $6,
        status_changed_at = $7,
        cancelled_at = $8,
        notes = $9,
        updated_at = $10
      WHERE user_id = $11
    `,
    [
      phone,
      planId,
      Number(billingAmountCents || 0),
      billingCycle,
      nextDueDate,
      customerStatus,
      statusChanged ? now : existing.statusChangedAt || now,
      cancelledAt,
      notes,
      now,
      id,
    ],
  )

  res.json({ user: await getCustomerById(id) })
})

router.delete('/:id', async (req, res) => {
  const row = await one('SELECT email FROM users WHERE id = $1', [req.params.id])

  if (!row) {
    return res.status(404).json({ error: 'Usuário não encontrado.' })
  }

  await query('DELETE FROM users WHERE id = $1', [req.params.id])
  res.status(204).send()
})

module.exports = router
