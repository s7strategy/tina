const express = require('express')
const { one, many, query, uid } = require('../lib/db')
const { requireAuth, requireRole } = require('../middleware/auth')

const router = express.Router()

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function serializePlan(plan) {
  return {
    ...plan,
    active: Boolean(plan.active),
    customerCount: Number(plan.customerCount || 0),
    priceCents: Number(plan.priceCents || 0),
  }
}

async function fetchPlan(id) {
  const row = await one(
    `
      SELECT
        plans.id,
        plans.name,
        plans.code,
        plans.limits_json AS "limitsJson",
        plans.price_cents AS "priceCents",
        plans.billing_cycle AS "billingCycle",
        plans.target_audience AS "targetAudience",
        plans.description,
        plans.active,
        plans.created_at AS "createdAt",
        COALESCE(customer_totals.customer_count, 0) AS "customerCount"
      FROM plans
      LEFT JOIN (
        SELECT plan_id, COUNT(*)::int AS customer_count
        FROM customer_accounts
        GROUP BY plan_id
      ) AS customer_totals ON customer_totals.plan_id = plans.id
      WHERE plans.id = $1
    `,
    [id],
  )

  return row ? serializePlan(row) : null
}

router.use(requireAuth, requireRole(['super_admin']))

router.get('/', async (_req, res) => {
  const plans = await many(`
    SELECT
      plans.id,
      plans.name,
      plans.code,
      plans.limits_json AS "limitsJson",
      plans.price_cents AS "priceCents",
      plans.billing_cycle AS "billingCycle",
      plans.target_audience AS "targetAudience",
      plans.description,
      plans.active,
      plans.created_at AS "createdAt",
      COALESCE(customer_totals.customer_count, 0) AS "customerCount"
    FROM plans
    LEFT JOIN (
      SELECT plan_id, COUNT(*)::int AS customer_count
      FROM customer_accounts
      GROUP BY plan_id
    ) AS customer_totals ON customer_totals.plan_id = plans.id
    ORDER BY plans.created_at DESC
  `)

  res.json({ plans: plans.map(serializePlan) })
})

router.post('/', async (req, res) => {
  const {
    name,
    priceCents = 0,
    billingCycle = 'monthly',
    targetAudience = '',
    description = '',
    active = true,
  } = req.body

  if (!name) {
    return res.status(400).json({ error: 'Nome do plano é obrigatório.' })
  }

  const baseCode = slugify(name) || 'plano'
  let code = baseCode
  let suffix = 1
  while (await one('SELECT id FROM plans WHERE code = $1', [code])) {
    suffix += 1
    code = `${baseCode}-${suffix}`
  }

  const plan = {
    id: uid('plan'),
    name,
    code,
    limitsJson: '{}',
    priceCents: Number(priceCents || 0),
    billingCycle,
    targetAudience,
    description,
    active: Boolean(active),
    createdAt: new Date().toISOString(),
  }

  await query(
    `
      INSERT INTO plans (id, name, code, limits_json, price_cents, billing_cycle, target_audience, description, active, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    [plan.id, plan.name, plan.code, plan.limitsJson, plan.priceCents, plan.billingCycle, plan.targetAudience, plan.description, plan.active, plan.createdAt],
  )

  res.status(201).json({ plan: await fetchPlan(plan.id) })
})

router.patch('/:id', async (req, res) => {
  const existing = await fetchPlan(req.params.id)

  if (!existing) {
    return res.status(404).json({ error: 'Plano não encontrado.' })
  }

  const {
    name = existing.name,
    priceCents = existing.priceCents,
    billingCycle = existing.billingCycle,
    targetAudience = existing.targetAudience || '',
    description = existing.description || '',
    active = existing.active,
  } = req.body

  if (!name) {
    return res.status(400).json({ error: 'Nome do plano é obrigatório.' })
  }

  await query(
    `
      UPDATE plans
      SET name = $1, price_cents = $2, billing_cycle = $3, target_audience = $4, description = $5, active = $6
      WHERE id = $7
    `,
    [name, Number(priceCents || 0), billingCycle, targetAudience, description, Boolean(active), req.params.id],
  )

  res.json({ plan: await fetchPlan(req.params.id) })
})

module.exports = router
