const bcrypt = require('bcryptjs')
const { Pool } = require('pg')
const { newDb } = require('pg-mem')

function createPool() {
  if (process.env.DATABASE_URL) {
    const ssl =
      process.env.DATABASE_SSL === 'false'
        ? false
        : {
            rejectUnauthorized: false,
          }

    return new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl,
    })
  }

  const memoryDb = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = memoryDb.adapters.createPg()
  return new adapter.Pool()
}

const db = createPool()

async function query(text, params = [], executor = db) {
  return executor.query(text, params)
}

async function many(text, params = [], executor = db) {
  const result = await query(text, params, executor)
  return result.rows
}

async function one(text, params = [], executor = db) {
  const result = await query(text, params, executor)
  return result.rows[0] || null
}

async function value(text, params = [], executor = db) {
  const row = await one(text, params, executor)
  return row ? Object.values(row)[0] : null
}

async function transaction(callback) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

async function migrate() {
  const statements = [
    `
      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role_id TEXT NOT NULL REFERENCES roles(id),
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE,
        limits_json TEXT NOT NULL DEFAULT '{}',
        price_cents INTEGER NOT NULL DEFAULT 0,
        billing_cycle TEXT NOT NULL DEFAULT 'monthly',
        target_audience TEXT,
        description TEXT,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS customer_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        phone TEXT,
        company_name TEXT,
        plan_id TEXT REFERENCES plans(id),
        billing_amount_cents INTEGER NOT NULL DEFAULT 0,
        billing_cycle TEXT NOT NULL DEFAULT 'monthly',
        next_due_date TIMESTAMPTZ,
        customer_status TEXT NOT NULL DEFAULT 'trial',
        status_changed_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ,
        notes TEXT,
        created_by_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        name TEXT NOT NULL,
        short TEXT,
        color TEXT NOT NULL,
        avatar_url TEXT,
        avatar_text TEXT,
        relation TEXT,
        profile_type TEXT,
        age INTEGER,
        status_color TEXT,
        stars INTEGER NOT NULL DEFAULT 0,
        streak INTEGER NOT NULL DEFAULT 0,
        work_subs_json TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL,
        UNIQUE(owner_user_id, key)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        profile_key TEXT NOT NULL,
        title TEXT NOT NULL,
        tag TEXT NOT NULL,
        points INTEGER NOT NULL DEFAULT 0,
        done BOOLEAN NOT NULL DEFAULT FALSE,
        recurrence TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        profile_key TEXT NOT NULL,
        icon TEXT NOT NULL,
        name TEXT NOT NULL,
        visibility_scope TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day_key TEXT NOT NULL,
        title TEXT NOT NULL,
        time TEXT NOT NULL,
        cls TEXT NOT NULL,
        member_keys_json TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS favorites (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        profile_key TEXT NOT NULL,
        icon TEXT NOT NULL,
        label TEXT NOT NULL,
        cat TEXT NOT NULL,
        sub TEXT,
        detail TEXT,
        created_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS meals (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day_label TEXT NOT NULL,
        icon TEXT NOT NULL,
        name TEXT NOT NULL,
        shopping TEXT,
        today BOOLEAN NOT NULL DEFAULT FALSE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS rewards (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tier_id TEXT NOT NULL,
        tier_label TEXT NOT NULL,
        cost INTEGER NOT NULL,
        color TEXT NOT NULL,
        label TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS time_entries (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        profile_key TEXT NOT NULL,
        category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
        label TEXT NOT NULL,
        cat TEXT,
        sub TEXT,
        detail TEXT,
        started_at TIMESTAMPTZ NOT NULL,
        ended_at TIMESTAMPTZ,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT FALSE,
        paused BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL,
        last_resumed_at TIMESTAMPTZ
      )
    `,
    `CREATE INDEX IF NOT EXISTS idx_tasks_owner_profile ON tasks(owner_user_id, profile_key)`,
    `CREATE INDEX IF NOT EXISTS idx_categories_owner_profile ON categories(owner_user_id, profile_key)`,
    `CREATE INDEX IF NOT EXISTS idx_members_owner_sort ON members(owner_user_id, sort_order, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_events_owner_day ON events(owner_user_id, day_key)`,
    `CREATE INDEX IF NOT EXISTS idx_favorites_owner_profile ON favorites(owner_user_id, profile_key)`,
    `CREATE INDEX IF NOT EXISTS idx_meals_owner_sort ON meals(owner_user_id, sort_order, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_rewards_owner_cost ON rewards(owner_user_id, cost, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_time_entries_owner_profile ON time_entries(owner_user_id, profile_key, created_at)`,
  ]

  for (const statement of statements) {
    await query(statement)
  }
}

async function initializeCustomerAccountForUser(userId, customerData = {}, executor = db) {
  const existingAccount = await one('SELECT id FROM customer_accounts WHERE user_id = $1 LIMIT 1', [userId], executor)
  if (existingAccount) return

  const now = new Date().toISOString()
  await query(
    `
      INSERT INTO customer_accounts (
        id, user_id, phone, company_name, plan_id, billing_amount_cents, billing_cycle,
        next_due_date, customer_status, status_changed_at, cancelled_at, notes, created_by_super_admin, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `,
    [
      uid('customer'),
      userId,
      customerData.phone || '',
      customerData.companyName || '',
      customerData.planId || 'plan-starter',
      Number(customerData.billingAmountCents || 0),
      customerData.billingCycle || 'monthly',
      customerData.nextDueDate || null,
      customerData.customerStatus || 'trial',
      customerData.statusChangedAt || now,
      customerData.customerStatus === 'cancelled' ? customerData.cancelledAt || now : null,
      customerData.notes || '',
      Boolean(customerData.createdBySuperAdmin),
      now,
      now,
    ],
    executor,
  )
}

async function initializeWorkspaceForUser(userId, name, customerData = {}, executor = db) {
  await initializeCustomerAccountForUser(userId, customerData, executor)

  const existingMember = await one('SELECT id FROM members WHERE owner_user_id = $1 LIMIT 1', [userId], executor)
  if (existingMember) return

  const now = new Date().toISOString()
  await query(
    `
      INSERT INTO members (
        id, owner_user_id, key, name, short, color, avatar_url, avatar_text, relation,
        profile_type, age, status_color, stars, streak, work_subs_json, sort_order, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    `,
    [
      uid('member'),
      userId,
      'self',
      name,
      'Minha rotina',
      '#7c6aef',
      '',
      (name || 'U').slice(0, 1).toUpperCase(),
      'Eu',
      'Adulto (gerencia tarefas)',
      null,
      '#22c55e',
      0,
      0,
      JSON.stringify([{ company: 'Sprint', activities: ['Planejamento', 'Execução', 'Revisão'] }]),
      1,
      now,
    ],
    executor,
  )

  await query(
    `
      INSERT INTO categories (id, owner_user_id, profile_key, icon, name, visibility_scope, created_at)
      VALUES ($1, $2, 'self', '💼', 'Trabalho', 'Eu', $3)
    `,
    [uid('cat'), userId, now],
    executor,
  )

  await query(
    `
      INSERT INTO tasks (id, owner_user_id, profile_key, title, tag, points, done, recurrence, created_at, updated_at)
      VALUES ($1, $2, 'self', 'Organizar agenda', 'Manhã', 5, FALSE, 'diario', $3, $4)
    `,
    [uid('task'), userId, now, now],
    executor,
  )

  await query(
    `
      INSERT INTO favorites (id, owner_user_id, profile_key, icon, label, cat, sub, detail, created_at)
      VALUES ($1, $2, 'self', '💼', 'Foco', '💼 Trabalho', 'Sprint', '', $3)
    `,
    [uid('fav'), userId, now],
    executor,
  )

  await query(
    `
      INSERT INTO meals (id, owner_user_id, day_label, icon, name, shopping, today, sort_order, created_at)
      VALUES ($1, $2, 'Qua · Hoje', '🥗', 'Salada proteica', 'alface, frango, tomate', TRUE, 1, $3)
    `,
    [uid('meal'), userId, now],
    executor,
  )

  await query(
    `
      INSERT INTO rewards (id, owner_user_id, tier_id, tier_label, cost, color, label, created_at)
      VALUES ($1, $2, 'tier-6', '🔵 Escolhas do Dia', 6, '#6fa8dc', '☕ Café especial', $3)
    `,
    [uid('reward'), userId, now],
    executor,
  )
}

async function seed() {
  const now = new Date().toISOString()

  await transaction(async (client) => {
    const roles = [
      { id: 'role-super-admin', key: 'super_admin', label: 'Super Admin' },
      { id: 'role-admin', key: 'admin', label: 'Admin' },
      { id: 'role-user', key: 'user', label: 'User' },
    ]

    for (const role of roles) {
      await query(
        `
          INSERT INTO roles (id, key, label)
          VALUES ($1, $2, $3)
          ON CONFLICT (id) DO UPDATE SET key = EXCLUDED.key, label = EXCLUDED.label
        `,
        [role.id, role.key, role.label],
        client,
      )
    }

    const roleMap = new Map(
      (await many('SELECT id, key FROM roles', [], client)).map((role) => [role.key, role.id]),
    )

    const users = [
      { id: 'user-super-admin', name: 'TINA', email: 'superadmin@tina.local', password: 'admin123', role: 'super_admin' },
      { id: 'user-admin', name: 'Jessica Admin', email: 'admin@tina.local', password: 'admin123', role: 'admin' },
      { id: 'user-basic', name: 'Usuário Demo', email: 'user@tina.local', password: 'user123', role: 'user' },
    ]

    for (const user of users) {
      await query(
        `
          INSERT INTO users (id, name, email, password_hash, role_id, status, created_at)
          VALUES ($1, $2, $3, $4, $5, 'active', $6)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            password_hash = EXCLUDED.password_hash,
            role_id = EXCLUDED.role_id,
            status = EXCLUDED.status
        `,
        [user.id, user.name, user.email, bcrypt.hashSync(user.password, 10), roleMap.get(user.role), now],
        client,
      )
    }

    const plans = [
      {
        id: 'plan-starter',
        name: 'Essencial',
        code: 'essencial',
        limitsJson: '{}',
        priceCents: 9900,
        billingCycle: 'monthly',
        targetAudience: 'Para quem está começando',
        description: 'Plano de entrada com recursos essenciais.',
        active: true,
      },
      {
        id: 'plan-growth',
        name: 'Profissional',
        code: 'profissional',
        limitsJson: '{}',
        priceCents: 24900,
        billingCycle: 'monthly',
        targetAudience: 'Para operação em crescimento',
        description: 'Mais controle para acompanhar clientes e rotina.',
        active: true,
      },
      {
        id: 'plan-scale',
        name: 'Elite',
        code: 'elite',
        limitsJson: '{}',
        priceCents: 59900,
        billingCycle: 'monthly',
        targetAudience: 'Para operação madura',
        description: 'Camada premium para gestão mais robusta.',
        active: true,
      },
    ]

    for (const plan of plans) {
      await query(
        `
          INSERT INTO plans (id, name, code, limits_json, price_cents, billing_cycle, target_audience, description, active, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            code = EXCLUDED.code,
            limits_json = EXCLUDED.limits_json,
            price_cents = EXCLUDED.price_cents,
            billing_cycle = EXCLUDED.billing_cycle,
            target_audience = EXCLUDED.target_audience,
            description = EXCLUDED.description,
            active = EXCLUDED.active
        `,
        [
          plan.id,
          plan.name,
          plan.code,
          plan.limitsJson,
          plan.priceCents,
          plan.billingCycle,
          plan.targetAudience,
          plan.description,
          plan.active,
          now,
        ],
        client,
      )
    }

    await initializeCustomerAccountForUser(
      'user-admin',
      {
        phone: '(11) 98888-1000',
        planId: 'plan-growth',
        billingAmountCents: 24900,
        billingCycle: 'monthly',
        nextDueDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
        customerStatus: 'active',
        notes: 'Cliente referência para testes administrativos.',
        createdBySuperAdmin: true,
      },
      client,
    )

    await initializeCustomerAccountForUser(
      'user-basic',
      {
        phone: '(11) 97777-2000',
        planId: 'plan-starter',
        billingAmountCents: 9900,
        billingCycle: 'monthly',
        nextDueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
        customerStatus: 'trial',
        notes: 'Conta usada para validar onboarding.',
        createdBySuperAdmin: true,
      },
      client,
    )

    const taskCount = Number(await value('SELECT COUNT(*) FROM tasks WHERE owner_user_id = $1', ['user-admin'], client))
    if (taskCount === 0) {
      const taskSeeds = [
        { ownerUserId: 'user-admin', profileKey: 'pedro', title: 'Arrumar a cama', tag: 'Manhã', points: 5, done: true, recurrence: 'seg-sex' },
        { ownerUserId: 'user-admin', profileKey: 'pedro', title: 'Lição de casa', tag: 'Tarde', points: 10, done: true, recurrence: 'seg-sex' },
        { ownerUserId: 'user-admin', profileKey: 'sofia', title: 'Ajudar no jantar', tag: 'Noite', points: 8, done: true, recurrence: 'seg-sex' },
        { ownerUserId: 'user-admin', profileKey: 'mae', title: 'Pagar conta de luz', tag: 'Tarde', points: 0, done: false, recurrence: 'mensal' },
        { ownerUserId: 'user-basic', profileKey: 'self', title: 'Organizar agenda', tag: 'Manhã', points: 5, done: false, recurrence: 'diario' },
      ]

      for (const task of taskSeeds) {
        await query(
          `
            INSERT INTO tasks (id, owner_user_id, profile_key, title, tag, points, done, recurrence, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `,
          [uid('task'), task.ownerUserId, task.profileKey, task.title, task.tag, task.points, task.done, task.recurrence, now, now],
          client,
        )
      }
    }

    const categoryCount = Number(await value('SELECT COUNT(*) FROM categories WHERE owner_user_id = $1', ['user-admin'], client))
    if (categoryCount === 0) {
      const categorySeeds = [
        { ownerUserId: 'user-admin', profileKey: 'pedro', icon: '📚', name: 'Estudo', visibilityScope: 'Pedro' },
        { ownerUserId: 'user-admin', profileKey: 'sofia', icon: '💃', name: 'Ballet', visibilityScope: 'Sofia' },
        { ownerUserId: 'user-admin', profileKey: 'mae', icon: '💼', name: 'Trabalho', visibilityScope: 'Todos' },
        { ownerUserId: 'user-basic', profileKey: 'self', icon: '💼', name: 'Trabalho', visibilityScope: 'Eu' },
      ]

      for (const category of categorySeeds) {
        await query(
          `
            INSERT INTO categories (id, owner_user_id, profile_key, icon, name, visibility_scope, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [uid('cat'), category.ownerUserId, category.profileKey, category.icon, category.name, category.visibilityScope, now],
          client,
        )
      }
    }

    const members = [
      {
        id: 'member-admin-mae',
        owner_user_id: 'user-admin',
        key: 'mae',
        name: 'Mamãe',
        short: '3/5 tarefas',
        color: '#7c6aef',
        avatar_url: 'https://i.pravatar.cc/84?img=47',
        avatar_text: 'M',
        relation: 'Mãe',
        profile_type: 'Adulto (gerencia tarefas)',
        age: 36,
        status_color: '#22c55e',
        stars: 0,
        streak: 0,
        work_subs_json: JSON.stringify([
          { company: 'S7 Strategy', activities: ['Campanhas', 'Criativos', 'Relatórios', 'Reunião'] },
          { company: 'Freelance', activities: ['Projeto avulso', 'Consultoria'] },
          { company: 'Estudo', activities: ['Curso', 'Leitura', 'Pesquisa'] },
        ]),
        sort_order: 1,
        created_at: now,
      },
      {
        id: 'member-admin-pai',
        owner_user_id: 'user-admin',
        key: 'pai',
        name: 'Papai',
        short: '2/4 tarefas',
        color: '#2d9cdb',
        avatar_url: 'https://i.pravatar.cc/84?img=68',
        avatar_text: 'P',
        relation: 'Pai',
        profile_type: 'Adulto (gerencia tarefas)',
        age: 38,
        status_color: '#f59e0b',
        stars: 0,
        streak: 0,
        work_subs_json: JSON.stringify([{ company: 'Freelance', activities: ['Projeto', 'Reunião', 'Proposta'] }]),
        sort_order: 2,
        created_at: now,
      },
      {
        id: 'member-admin-pedro',
        owner_user_id: 'user-admin',
        key: 'pedro',
        name: 'Pedro',
        short: '5/6 · ⭐186',
        color: '#27ae60',
        avatar_url: 'https://i.pravatar.cc/84?img=59',
        avatar_text: 'Pe',
        relation: 'Filho',
        profile_type: 'Criança (recebe tarefas + estrelas)',
        age: 9,
        status_color: '#22c55e',
        stars: 186,
        streak: 12,
        work_subs_json: JSON.stringify([]),
        sort_order: 3,
        created_at: now,
      },
      {
        id: 'member-admin-sofia',
        owner_user_id: 'user-admin',
        key: 'sofia',
        name: 'Sofia',
        short: '6/6 ✓ · ⭐143',
        color: '#e84393',
        avatar_url: 'https://i.pravatar.cc/84?img=44',
        avatar_text: 'S',
        relation: 'Filha',
        profile_type: 'Criança (recebe tarefas + estrelas)',
        age: 7,
        status_color: '#e84393',
        stars: 143,
        streak: 8,
        work_subs_json: JSON.stringify([]),
        sort_order: 4,
        created_at: now,
      },
      {
        id: 'member-admin-vovo',
        owner_user_id: 'user-admin',
        key: 'vovo',
        name: 'Vovó',
        short: '0/2 tarefas',
        color: '#e67e22',
        avatar_url: 'https://i.pravatar.cc/84?img=32',
        avatar_text: 'V',
        relation: 'Avó',
        profile_type: 'Observador (só visualiza)',
        age: 67,
        status_color: '#e67e22',
        stars: 0,
        streak: 0,
        work_subs_json: JSON.stringify([]),
        sort_order: 5,
        created_at: now,
      },
      {
        id: 'member-basic-self',
        owner_user_id: 'user-basic',
        key: 'self',
        name: 'Usuário Demo',
        short: 'Minha rotina',
        color: '#7c6aef',
        avatar_url: '',
        avatar_text: 'U',
        relation: 'Eu',
        profile_type: 'Adulto (gerencia tarefas)',
        age: 30,
        status_color: '#22c55e',
        stars: 24,
        streak: 3,
        work_subs_json: JSON.stringify([{ company: 'Sprint', activities: ['Planejamento', 'Execução', 'Revisão'] }]),
        sort_order: 1,
        created_at: now,
      },
    ]

    for (const member of members) {
      await query(
        `
          INSERT INTO members (
            id, owner_user_id, key, name, short, color, avatar_url, avatar_text, relation,
            profile_type, age, status_color, stars, streak, work_subs_json, sort_order, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          ON CONFLICT (id) DO NOTHING
        `,
        [
          member.id,
          member.owner_user_id,
          member.key,
          member.name,
          member.short,
          member.color,
          member.avatar_url,
          member.avatar_text,
          member.relation,
          member.profile_type,
          member.age,
          member.status_color,
          member.stars,
          member.streak,
          member.work_subs_json,
          member.sort_order,
          member.created_at,
        ],
        client,
      )
    }

    const eventCount = Number(await value('SELECT COUNT(*) FROM events WHERE owner_user_id = $1', ['user-admin'], client))
    if (eventCount === 0) {
      const eventSeeds = [
        ['user-admin', 'seg', '🏫 Escola', '07–12h', 'ce-ped', ['pedro', 'sofia']],
        ['user-admin', 'seg', '🧘 Yoga', '09h', 'ce-mae', ['mae']],
        ['user-admin', 'seg', '💼 Reunião', '14h', 'ce-pai', ['pai']],
        ['user-admin', 'seg', '⚽ Futebol', '16h', 'ce-ped', ['pedro']],
        ['user-admin', 'ter', '🏫 Escola', '07–12h', 'ce-ped', ['pedro', 'sofia']],
        ['user-admin', 'ter', '🏥 Pediatra', '14h', 'ce-mae', ['mae', 'sofia']],
        ['user-admin', 'ter', '💃 Ballet', '15h', 'ce-sof', ['sofia']],
        ['user-admin', 'qua', '🏫 Escola', '07–12h', 'ce-ped', ['pedro', 'sofia']],
        ['user-admin', 'qua', '🧘 Yoga', '09h', 'ce-mae', ['mae']],
        ['user-admin', 'qua', '💃 Ballet', '15h', 'ce-sof', ['sofia', 'mae']],
        ['user-admin', 'qua', '🏫 Reunião escola', '19h', 'ce-all', ['mae', 'pai']],
        ['user-admin', 'qui', '🏫 Escola', '07–12h', 'ce-ped', ['pedro', 'sofia']],
        ['user-admin', 'qui', '🥋 Jiu-jitsu', '19:30', 'ce-pai', ['pai']],
        ['user-admin', 'sex', '🏫 Escola', '07–12h', 'ce-ped', ['pedro', 'sofia']],
        ['user-admin', 'sex', '🎬 Filme', '20h', 'ce-all', ['mae', 'pai', 'pedro', 'sofia']],
        ['user-admin', 'sab', '⚽ Jogo', '09h', 'ce-ped', ['pedro', 'pai']],
        ['user-admin', 'sab', '🛒 Feira', '08h', 'ce-mae', ['mae']],
        ['user-admin', 'sab', '🍕 Almoço vovó', '12h', 'ce-all', ['mae', 'pai', 'pedro', 'sofia']],
        ['user-admin', 'dom', '⛪ Missa', '10h', 'ce-all', ['mae']],
        ['user-admin', 'dom', '🏖️ Parque', '15h', 'ce-all', ['mae', 'pai', 'pedro', 'sofia']],
        ['user-basic', 'qua', '💼 Reunião Sprint', '10h', 'ce-all', ['self']],
      ]

      for (const [ownerUserId, dayKey, title, time, cls, memberKeys] of eventSeeds) {
        await query(
          `
            INSERT INTO events (id, owner_user_id, day_key, title, time, cls, member_keys_json, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          [uid('evt'), ownerUserId, dayKey, title, time, cls, JSON.stringify(memberKeys), now],
          client,
        )
      }
    }

    const favoriteCount = Number(await value('SELECT COUNT(*) FROM favorites WHERE owner_user_id = $1', ['user-admin'], client))
    if (favoriteCount === 0) {
      const favorites = [
        ['fav-mae-1', 'user-admin', 'mae', '💼', 'Trabalho', '💼 Trabalho', 'S7 Strategy', 'Campanhas'],
        ['fav-mae-2', 'user-admin', 'mae', '🧘', 'Yoga', '🧘 Pessoal', 'Yoga', ''],
        ['fav-pai-1', 'user-admin', 'pai', '💼', 'Freelance', '💼 Trabalho', 'Freelance', 'Projeto'],
        ['fav-pedro-1', 'user-admin', 'pedro', '🏫', 'Escola', '🏫 Escola', '', ''],
        ['fav-sofia-1', 'user-admin', 'sofia', '💃', 'Ballet', '🧘 Pessoal', 'Ballet', ''],
        ['fav-basic-1', 'user-basic', 'self', '💼', 'Foco', '💼 Trabalho', 'Sprint', ''],
      ]

      for (const favorite of favorites) {
        await query(
          `
            INSERT INTO favorites (id, owner_user_id, profile_key, icon, label, cat, sub, detail, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `,
          [...favorite, now],
          client,
        )
      }
    }

    const mealCount = Number(await value('SELECT COUNT(*) FROM meals WHERE owner_user_id = $1', ['user-admin'], client))
    if (mealCount === 0) {
      const meals = [
        ['meal-admin-1', 'user-admin', 'Seg', '🍗', 'Frango grelhado', '', false, 1],
        ['meal-admin-2', 'user-admin', 'Ter', '🍝', 'Macarrão bolonhesa', '', false, 2],
        ['meal-admin-3', 'user-admin', 'Qua · Hoje', '🐟', 'Peixe com legumes', 'tilápia, cenoura', true, 3],
        ['meal-admin-4', 'user-admin', 'Qui', '🥘', 'Feijoada leve', '', false, 4],
        ['meal-admin-5', 'user-admin', 'Sex', '🍕', 'Noite da pizza!', '', false, 5],
        ['meal-admin-6', 'user-admin', 'Sáb', '🍖', 'Almoço na vovó', '', false, 6],
        ['meal-admin-7', 'user-admin', 'Dom', '🥩', 'Churrasco', 'picanha', false, 7],
        ['meal-basic-1', 'user-basic', 'Qua · Hoje', '🥗', 'Salada proteica', 'alface, frango, tomate', true, 1],
      ]

      for (const meal of meals) {
        await query(
          `
            INSERT INTO meals (id, owner_user_id, day_label, icon, name, shopping, today, sort_order, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `,
          [...meal, now],
          client,
        )
      }
    }

    const rewardCount = Number(await value('SELECT COUNT(*) FROM rewards WHERE owner_user_id = $1', ['user-admin'], client))
    if (rewardCount === 0) {
      const rewardGroups = [
        ['tier-6', '🔵 Escolhas do Dia', 6, '#6fa8dc', ['🎵 Música do carro', '🎨 Cor do dia', '🥪 Lanche']],
        ['tier-8', '🟠 Especiais', 8, '#e8983a', ['🍿 Lanche + filme', '🎬 Filme família', '👩‍🍳 Cozinhar juntos']],
        ['tier-12', '🟣 Super', 12, '#b07ec5', ['🎀 Festa do pijama', '✅ Dia do SIM', '🎁 Passeio surpresa']],
      ]

      for (const [tierId, tierLabel, cost, color, labels] of rewardGroups) {
        for (const label of labels) {
          await query(
            `
              INSERT INTO rewards (id, owner_user_id, tier_id, tier_label, cost, color, label, created_at)
              VALUES ($1, 'user-admin', $2, $3, $4, $5, $6, $7)
            `,
            [uid('reward'), tierId, tierLabel, cost, color, label, now],
            client,
          )
        }
      }

      await query(
        `
          INSERT INTO rewards (id, owner_user_id, tier_id, tier_label, cost, color, label, created_at)
          VALUES ($1, 'user-basic', 'tier-6', '🔵 Escolhas do Dia', 6, '#6fa8dc', '☕ Café especial', $2)
        `,
        [uid('reward'), now],
        client,
      )
    }

    const timeEntryCount = Number(await value('SELECT COUNT(*) FROM time_entries WHERE owner_user_id = $1', ['user-admin'], client))
    if (timeEntryCount === 0) {
      const referenceDate = new Date()
      const minutesAgo = (value) => new Date(referenceDate.getTime() - value * 60 * 1000).toISOString()
      const hoursAgo = (value) => new Date(referenceDate.getTime() - value * 60 * 60 * 1000).toISOString()
      const entries = [
        {
          ownerUserId: 'user-admin',
          profileKey: 'mae',
          label: '💼 Trabalho — S7 Strategy — Campanhas',
          cat: '💼 Trabalho',
          sub: 'S7 Strategy',
          detail: 'Campanhas',
          startedAt: hoursAgo(2.2),
          endedAt: null,
          durationSeconds: 0,
          active: true,
          paused: false,
          lastResumedAt: hoursAgo(2.2),
        },
        {
          ownerUserId: 'user-admin',
          profileKey: 'pai',
          label: '💼 Freelance — Projeto',
          cat: '💼 Trabalho',
          sub: 'Freelance',
          detail: 'Projeto',
          startedAt: hoursAgo(1),
          endedAt: null,
          durationSeconds: 3600,
          active: true,
          paused: true,
          lastResumedAt: null,
        },
        {
          ownerUserId: 'user-admin',
          profileKey: 'pedro',
          label: '🏫 Escola',
          cat: '🏫 Escola',
          sub: '',
          detail: '',
          startedAt: hoursAgo(4.5),
          endedAt: null,
          durationSeconds: 0,
          active: true,
          paused: false,
          lastResumedAt: hoursAgo(4.5),
        },
        {
          ownerUserId: 'user-admin',
          profileKey: 'sofia',
          label: '🏫 Escola',
          cat: '🏫 Escola',
          sub: '',
          detail: '',
          startedAt: hoursAgo(4.5),
          endedAt: null,
          durationSeconds: 0,
          active: true,
          paused: false,
          lastResumedAt: hoursAgo(4.5),
        },
        {
          ownerUserId: 'user-admin',
          profileKey: 'mae',
          label: '🧘 Yoga',
          cat: '🧘 Pessoal',
          sub: 'Yoga',
          detail: '',
          startedAt: hoursAgo(10),
          endedAt: hoursAgo(9),
          durationSeconds: 3600,
          active: false,
          paused: false,
          lastResumedAt: null,
        },
        {
          ownerUserId: 'user-admin',
          profileKey: 'pai',
          label: '🚗 Levar kids',
          cat: '🚗 Deslocamento',
          sub: 'Escola',
          detail: '',
          startedAt: minutesAgo(240),
          endedAt: minutesAgo(210),
          durationSeconds: 1800,
          active: false,
          paused: false,
          lastResumedAt: null,
        },
        {
          ownerUserId: 'user-basic',
          profileKey: 'self',
          label: '💼 Trabalho — Sprint',
          cat: '💼 Trabalho',
          sub: 'Sprint',
          detail: '',
          startedAt: minutesAgo(90),
          endedAt: null,
          durationSeconds: 0,
          active: true,
          paused: false,
          lastResumedAt: minutesAgo(90),
        },
      ]

      for (const entry of entries) {
        await query(
          `
            INSERT INTO time_entries (
              id, owner_user_id, profile_key, category_id, label, cat, sub, detail,
              started_at, ended_at, duration_seconds, active, paused, created_at, last_resumed_at
            ) VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          `,
          [
            uid('time'),
            entry.ownerUserId,
            entry.profileKey,
            entry.label,
            entry.cat,
            entry.sub,
            entry.detail,
            entry.startedAt,
            entry.endedAt,
            entry.durationSeconds,
            entry.active,
            entry.paused,
            now,
            entry.lastResumedAt,
          ],
          client,
        )
      }
    }
  })
}

async function getRoleByUserId(userId) {
  return one(
    `
      SELECT users.id, users.name, users.email, users.status, roles.key AS role
      FROM users
      JOIN roles ON roles.id = users.role_id
      WHERE users.id = $1
    `,
    [userId],
  )
}

module.exports = {
  db,
  query,
  many,
  one,
  value,
  transaction,
  migrate,
  seed,
  uid,
  initializeCustomerAccountForUser,
  initializeWorkspaceForUser,
  getRoleByUserId,
}
