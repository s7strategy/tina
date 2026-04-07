const bcrypt = require('bcryptjs')
const { Pool } = require('pg')
const { newDb } = require('pg-mem')
const { seedEbookGlobalRecipesFromFile } = require('./seedEbookGlobalRecipes')

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

const APP_TZ_MIG = process.env.APP_TZ || 'America/Sao_Paulo'

function ymdAppTz(d) {
  return d.toLocaleDateString('en-CA', { timeZone: APP_TZ_MIG })
}

function weekdayMon0AppTz(d) {
  const s = new Intl.DateTimeFormat('en-US', { timeZone: APP_TZ_MIG, weekday: 'short' }).format(d)
  const map = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
  return map[s] ?? 0
}

function mondayOfWeekContainingNow() {
  const now = new Date()
  const diff = weekdayMon0AppTz(now)
  return new Date(now.getTime() - diff * 86400000)
}

function labelToDayOffset(dayLabel) {
  const s = String(dayLabel).toLowerCase()
  if (s.includes('dom')) return 6
  if (s.includes('sáb') || s.includes('sab')) return 5
  if (s.includes('sex')) return 4
  if (s.includes('qui')) return 3
  if (s.includes('qua')) return 2
  if (s.includes('ter')) return 1
  if (s.includes('seg')) return 0
  return 0
}

function planDateYmdForLegacyLabel(dayLabel) {
  const monday = mondayOfWeekContainingNow()
  const off = labelToDayOffset(dayLabel)
  return ymdAppTz(new Date(monday.getTime() + off * 86400000))
}

/** One-time: copy flat `meals` → menus + menu_slots (semana actual por dia da semana). */
async function migrateLegacyMealsToPlanner() {
  const userRows = await many(`SELECT DISTINCT owner_user_id FROM meals WHERE owner_user_id IS NOT NULL`)
  for (const row of userRows) {
    const ownerUserId = row.owner_user_id
    const cnt = await value(`SELECT COUNT(*)::int FROM menu_slots WHERE owner_user_id = $1`, [ownerUserId])
    if (Number(cnt) > 0) continue

    const oldMeals = await many(
      `SELECT icon, name, day_label, sort_order FROM meals WHERE owner_user_id = $1 ORDER BY sort_order ASC, created_at ASC`,
      [ownerUserId],
    )
    if (oldMeals.length === 0) continue

    const now = new Date().toISOString()
    const mid = uid('menu')
    await query(
      `
        INSERT INTO menus (id, owner_user_id, name, sort_order, created_at)
        VALUES ($1, $2, $3, 0, $4)
      `,
      [mid, ownerUserId, 'Meu cardápio', now],
    )

    let sortOrder = 0
    for (const m of oldMeals) {
      const planDate = planDateYmdForLegacyLabel(m.day_label)
      const sid = uid('mns')
      const title = `${m.icon || ''} ${m.name || ''}`.trim() || 'Refeição'
      await query(
        `
          INSERT INTO menu_slots (id, owner_user_id, menu_id, plan_date, slot_type, recipe_id, custom_title, sort_order)
          VALUES ($1, $2, $3, $4::date, 'lunch', NULL, $5, $6)
        `,
        [sid, ownerUserId, mid, planDate, title, sortOrder++],
      )
    }
  }
}

/** One-time: meal_day_groups + meal_slots → menus + menu_slots (antes de remover tabelas antigas). */
async function migratePlannerGroupsToMenus() {
  try {
    await query(`SELECT 1 FROM meal_slots LIMIT 1`)
  } catch {
    return
  }

  const cnt = await value(`SELECT COUNT(*)::int FROM menu_slots`)
  if (Number(cnt) > 0) return

  const slotRows = await many(
    `
      SELECT ms.id AS "oldId", mdg.owner_user_id AS "ownerUserId", mdg.plan_date AS "planDate",
             ms.slot_type AS "slotType", ms.recipe_id AS "recipeId", ms.custom_title AS "customTitle",
             ms.sort_order AS "sortOrder"
      FROM meal_slots ms
      INNER JOIN meal_day_groups mdg ON mdg.id = ms.meal_day_group_id
    `,
  )
  if (slotRows.length === 0) return

  const userIds = [...new Set(slotRows.map((r) => r.ownerUserId))]
  const now = new Date().toISOString()
  const menuByUser = new Map()
  for (const ownerUserId of userIds) {
    const mid = uid('menu')
    await query(
      `
        INSERT INTO menus (id, owner_user_id, name, sort_order, created_at)
        VALUES ($1, $2, $3, 0, $4)
      `,
      [mid, ownerUserId, 'Meu cardápio', now],
    )
    menuByUser.set(ownerUserId, mid)
  }

  for (const r of slotRows) {
    const menuId = menuByUser.get(r.ownerUserId)
    const newId = uid('mns')
    await query(
      `
        INSERT INTO menu_slots (id, owner_user_id, menu_id, plan_date, slot_type, recipe_id, custom_title, sort_order)
        VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8)
      `,
      [
        newId,
        r.ownerUserId,
        menuId,
        r.planDate,
        r.slotType,
        r.recipeId,
        r.customTitle,
        r.sortOrder,
      ],
    )
  }
}

/** Remove tabelas legadas após dados estarem em menus/menu_slots. */
async function dropLegacyMealPlannerTables() {
  try {
    await query(`DROP TABLE IF EXISTS meal_slots CASCADE`)
    await query(`DROP TABLE IF EXISTS meal_day_groups CASCADE`)
  } catch (e) {
    console.error('dropLegacyMealPlannerTables:', e)
  }
}

/**
 * Após existirem colunas meal_kind / is_system_default: remove cardápios extra (ex. "Meu cardápio"),
 * move slots para o cardápio base certo e mantém só os 4 fixos por utilizador.
 */
async function purgeExtraMenusAndReassignSlots() {
  const { ensureDefaultMenusForUser, plannerSlotTypeToMealKind } = require('./defaultMenus')
  const users = await many(`SELECT id FROM users`)
  for (const u of users) {
    await ensureDefaultMenusForUser(u.id)
  }
  const extras = await many(
    `SELECT id, owner_user_id FROM menus WHERE COALESCE(is_system_default, FALSE) = FALSE`,
  )
  for (const menu of extras) {
    const kinds = await many(
      `
        SELECT id, meal_kind FROM menus
        WHERE owner_user_id = $1 AND COALESCE(is_system_default, FALSE) = TRUE AND meal_kind IS NOT NULL
      `,
      [menu.owner_user_id],
    )
    const byKind = {}
    for (const k of kinds) {
      if (k.meal_kind) byKind[k.meal_kind] = k.id
    }
    const fallbackTarget = byKind.almoco || kinds[0]?.id || null
    const slots = await many(`SELECT id, slot_type FROM menu_slots WHERE menu_id = $1`, [menu.id])
    for (const s of slots) {
      const mk = plannerSlotTypeToMealKind(s.slot_type)
      const target = byKind[mk] || fallbackTarget
      if (target) {
        await query(`UPDATE menu_slots SET menu_id = $1 WHERE id = $2`, [target, s.id])
      }
    }
  }
  await query(`DELETE FROM menus WHERE COALESCE(is_system_default, FALSE) = FALSE`)
  await query(`
    UPDATE menus SET sort_order = CASE meal_kind
      WHEN 'cafe_manha' THEN 0
      WHEN 'almoco' THEN 1
      WHEN 'jantar' THEN 2
      WHEN 'lanche' THEN 3
      ELSE sort_order
    END
    WHERE COALESCE(is_system_default, FALSE) = TRUE
      AND meal_kind IN ('cafe_manha', 'almoco', 'jantar', 'lanche')
  `)
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
        participant_keys_json TEXT DEFAULT '[]',
        title TEXT NOT NULL,
        tag TEXT NOT NULL DEFAULT '',
        time_type TEXT NOT NULL DEFAULT 'none',
        time_value TEXT NOT NULL DEFAULT '',
        priority INTEGER NOT NULL DEFAULT 0,
        reward TEXT NOT NULL DEFAULT '',
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
        owner_user_id TEXT NOT NULL,
        day_key TEXT NOT NULL,
        event_date TEXT,
        title TEXT NOT NULL,
        event_time TEXT NOT NULL,
        cls TEXT NOT NULL,
        member_keys_json TEXT DEFAULT '[]',
        recurrence_type TEXT DEFAULT 'único',
        recurrence_days TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS task_history (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        profile_key TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
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
        participant_keys_json TEXT DEFAULT '[]',
        sort_order INTEGER NOT NULL DEFAULT 0,
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
      CREATE TABLE IF NOT EXISTS recipes (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'simple',
        image_url TEXT,
        placeholder_key TEXT,
        base_servings NUMERIC NOT NULL DEFAULT 4,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS recipe_ingredients (
        id TEXT PRIMARY KEY,
        recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        name TEXT NOT NULL,
        quantity TEXT NOT NULL DEFAULT '',
        unit TEXT
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS recipe_member_servings (
        id TEXT PRIMARY KEY,
        recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        servings NUMERIC NOT NULL DEFAULT 1,
        UNIQUE(recipe_id, member_id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS menus (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS menu_slots (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        menu_id TEXT NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
        plan_date DATE NOT NULL,
        slot_type TEXT NOT NULL,
        recipe_id TEXT REFERENCES recipes(id) ON DELETE SET NULL,
        custom_title TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS shopping_lists (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT,
        kind TEXT NOT NULL DEFAULT 'manual',
        horizon_days INTEGER,
        period_start DATE,
        period_end DATE,
        created_at TIMESTAMPTZ NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS shopping_items (
        id TEXT PRIMARY KEY,
        list_id TEXT NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        quantity_text TEXT NOT NULL DEFAULT '',
        unit TEXT,
        checked BOOLEAN NOT NULL DEFAULT FALSE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'manual'
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
        last_resumed_at TIMESTAMPTZ,
        favorite_id TEXT
      )
    `,
    `CREATE INDEX IF NOT EXISTS idx_tasks_owner_profile ON tasks(owner_user_id, profile_key)`,
    `CREATE INDEX IF NOT EXISTS idx_categories_owner_profile ON categories(owner_user_id, profile_key)`,
    `CREATE INDEX IF NOT EXISTS idx_members_owner_sort ON members(owner_user_id, sort_order, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_events_owner_day ON events(owner_user_id, day_key)`,
    `CREATE INDEX IF NOT EXISTS idx_favorites_owner_profile ON favorites(owner_user_id, profile_key)`,
    `CREATE INDEX IF NOT EXISTS idx_meals_owner_sort ON meals(owner_user_id, sort_order, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_recipes_owner ON recipes(owner_user_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id, sort_order)`,
    `CREATE INDEX IF NOT EXISTS idx_recipe_member_servings_recipe ON recipe_member_servings(recipe_id)`,
    `CREATE INDEX IF NOT EXISTS idx_menus_owner ON menus(owner_user_id, sort_order, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_menu_slots_menu_date ON menu_slots(menu_id, plan_date)`,
    `CREATE INDEX IF NOT EXISTS idx_menu_slots_owner ON menu_slots(owner_user_id, plan_date)`,
    `CREATE INDEX IF NOT EXISTS idx_shopping_lists_owner ON shopping_lists(owner_user_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_shopping_items_list ON shopping_items(list_id, sort_order)`,
    `CREATE INDEX IF NOT EXISTS idx_rewards_owner_cost ON rewards(owner_user_id, cost, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_time_entries_owner_profile ON time_entries(owner_user_id, profile_key, created_at)`,
  ]

  for (const statement of statements) {
    await query(statement)
  }

  try {
    await query(`ALTER TABLE favorites ADD COLUMN participant_keys_json TEXT DEFAULT '[]'`)
  } catch (_) { /* column already exists */ }
  try {
    await query(`ALTER TABLE favorites ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`)
  } catch (_) { /* column already exists */ }
  try {
    await query(`ALTER TABLE favorites ADD COLUMN icon_image_url TEXT`)
  } catch (_) { /* column already exists */ }
  try {
    await query(`ALTER TABLE categories ADD COLUMN icon_image_url TEXT`)
  } catch (_) { /* column already exists */ }
  try {
    await query(`ALTER TABLE time_entries ADD COLUMN favorite_id TEXT`)
  } catch (_) { /* column already exists */ }
  try {
    await query(`ALTER TABLE tasks ADD COLUMN for_date TEXT`)
  } catch (_) { /* column already exists */ }
  try {
    await query(`ALTER TABLE tasks ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE`)
  } catch (_) { /* column already exists */ }
  try {
    await query(`UPDATE tasks SET for_date = to_char(created_at::date, 'YYYY-MM-DD') WHERE for_date IS NULL`)
  } catch (_) { /* best-effort backfill */ }
  try {
    await query(`ALTER TABLE task_history ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'`)
  } catch (_) { /* column already exists */ }
  try {
    await query(`ALTER TABLE events RENAME COLUMN "time" TO event_time`)
  } catch (_) { /* já é event_time ou coluna time inexistente */ }
  try {
    await query(`ALTER TABLE events ADD COLUMN event_time TEXT NOT NULL DEFAULT '09:00'`)
  } catch (_) { /* já existe */ }
  try {
    await query(`UPDATE events SET event_time = "time"::text WHERE "time" IS NOT NULL`)
  } catch (_) { /* só existe event_time */ }
  try {
    await query(`ALTER TABLE events DROP COLUMN IF EXISTS "time"`)
  } catch (_) { /* */ }
  try {
    await query(`ALTER TABLE events ADD COLUMN event_date TEXT`)
  } catch (_) { /* column already exists */ }
  try {
    await query(`ALTER TABLE events ADD COLUMN recurrence_type TEXT DEFAULT 'único'`)
  } catch (_) { /* column already exists */ }
  try {
    await query(`ALTER TABLE events ADD COLUMN recurrence_days TEXT`)
  } catch (_) { /* column already exists */ }
  try {
    await query(
      `ALTER TABLE events ADD COLUMN created_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'`,
    )
  } catch (_) { /* column already exists */ }
  try {
    await query(
      `ALTER TABLE events ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'`,
    )
  } catch (_) { /* column already exists */ }
  try {
    await query(`
      UPDATE favorites f SET sort_order = s.rn FROM (
        SELECT id, (ROW_NUMBER() OVER (PARTITION BY owner_user_id, profile_key ORDER BY created_at ASC) - 1) AS rn
        FROM favorites
      ) s
      WHERE f.id = s.id
      AND EXISTS (
        SELECT 1 FROM favorites f2
        WHERE f2.owner_user_id = f.owner_user_id AND f2.profile_key = f.profile_key
        GROUP BY f2.owner_user_id, f2.profile_key
        HAVING COUNT(*) > 1 AND COUNT(DISTINCT f2.sort_order) = 1
      )
    `)
  } catch (_) { /* best-effort backfill for legacy rows sharing the same sort_order */ }

  try {
    await migratePlannerGroupsToMenus()
  } catch (e) {
    console.error('migratePlannerGroupsToMenus:', e)
  }

  try {
    await migrateLegacyMealsToPlanner()
  } catch (e) {
    console.error('migrateLegacyMealsToPlanner:', e)
  }

  try {
    await dropLegacyMealPlannerTables()
  } catch (e) {
    console.error('dropLegacyMealPlannerTables:', e)
  }

  try {
    await query(`ALTER TABLE shopping_items ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'`)
  } catch (_) {
    /* coluna já existe */
  }
  try {
    await query(`UPDATE shopping_items SET source = 'manual' WHERE source IS NULL OR trim(source) = ''`)
  } catch (_) {
    /* best-effort */
  }
  try {
    await query(
      `UPDATE shopping_items SET source = 'manual' WHERE source NOT IN ('manual', 'generated')`,
    )
  } catch (_) {
    /* best-effort */
  }

  try {
    await query(`ALTER TABLE recipes ADD COLUMN grams_per_portion NUMERIC`)
  } catch (_) {
    /* já existe */
  }
  try {
    await query(`ALTER TABLE recipes ADD COLUMN ml_per_portion NUMERIC`)
  } catch (_) {
    /* já existe */
  }
  try {
    await query(`ALTER TABLE recipes ADD COLUMN spoon_soup_per_portion NUMERIC`)
  } catch (_) {
    /* já existe */
  }
  try {
    await query(`ALTER TABLE recipes ADD COLUMN spoon_tea_per_portion NUMERIC`)
  } catch (_) {
    /* já existe */
  }
  try {
    await query(`ALTER TABLE recipe_member_servings ADD COLUMN amount_unit TEXT NOT NULL DEFAULT 'portion'`)
  } catch (_) {
    /* já existe */
  }
  try {
    await query(`ALTER TABLE recipes ADD COLUMN recipe_category TEXT`)
  } catch (_) {
    /* já existe */
  }
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS meal_combinations (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      )
    `)
  } catch (_) {
    /* */
  }
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS meal_combination_items (
        id TEXT PRIMARY KEY,
        combination_id TEXT NOT NULL REFERENCES meal_combinations(id) ON DELETE CASCADE,
        meal_category TEXT NOT NULL,
        recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        UNIQUE(combination_id, meal_category)
      )
    `)
  } catch (_) {
    /* */
  }
  try {
    await query(`CREATE INDEX IF NOT EXISTS idx_meal_combinations_owner ON meal_combinations(owner_user_id, created_at)`)
  } catch (_) {
    /* */
  }
  try {
    await query(
      `CREATE INDEX IF NOT EXISTS idx_meal_combination_items_combo ON meal_combination_items(combination_id, sort_order)`,
    )
  } catch (_) {
    /* */
  }

  try {
    await query(`
      CREATE TABLE IF NOT EXISTS family_meal_settings (
        owner_user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        auto_active BOOLEAN NOT NULL DEFAULT FALSE,
        member_spoons JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `)
  } catch (_) {
    /* */
  }
  try {
    await query(`ALTER TABLE recipes ADD COLUMN servings_source TEXT NOT NULL DEFAULT 'manual'`)
  } catch (_) {
    /* já existe */
  }
  try {
    await query(`ALTER TABLE recipes ADD COLUMN recipe_origin TEXT NOT NULL DEFAULT 'user'`)
  } catch (_) {
    /* já existe */
  }
  try {
    await query(`ALTER TABLE recipes ADD COLUMN global_source_id TEXT`)
  } catch (_) {
    /* já existe */
  }
  try {
    await query(`ALTER TABLE recipes ADD COLUMN tags JSONB NOT NULL DEFAULT '[]'::jsonb`)
  } catch (_) {
    /* já existe */
  }
  try {
    await query(`CREATE INDEX IF NOT EXISTS idx_recipes_tags ON recipes USING GIN (tags)`)
  } catch (_) {
    /* */
  }
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS recipe_steps (
        id TEXT PRIMARY KEY,
        recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        body TEXT NOT NULL DEFAULT ''
      )
    `)
  } catch (_) {
    /* */
  }
  try {
    await query(`CREATE INDEX IF NOT EXISTS idx_recipe_steps_recipe ON recipe_steps(recipe_id, sort_order)`)
  } catch (_) {
    /* */
  }
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS global_recipes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        recipe_category TEXT,
        ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,
        steps JSONB NOT NULL DEFAULT '[]'::jsonb,
        tags JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL
      )
    `)
  } catch (_) {
    /* */
  }
  try {
    await query(`CREATE INDEX IF NOT EXISTS idx_global_recipes_cat ON global_recipes(recipe_category)`)
  } catch (_) {
    /* */
  }
  try {
    await query(`CREATE INDEX IF NOT EXISTS idx_global_recipes_name ON global_recipes(name)`)
  } catch (_) {
    /* */
  }
  try {
    await query(`CREATE INDEX IF NOT EXISTS idx_global_recipes_tags ON global_recipes USING GIN (tags)`)
  } catch (_) {
    /* */
  }
  try {
    await query(`ALTER TABLE global_recipes ADD COLUMN meal_roles JSONB NOT NULL DEFAULT '[]'::jsonb`)
  } catch (_) {
    /* já existe */
  }
  try {
    await seedEbookGlobalRecipesFromFile(query)
    const demoRow = await one(`SELECT id FROM global_recipes WHERE id = $1`, ['glob-demo-strogonoff'])
    if (!demoRow) {
      const now = new Date().toISOString()
      await query(
        `
          INSERT INTO global_recipes (id, name, recipe_category, ingredients, steps, tags, created_at)
          VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7)
        `,
        [
          'glob-demo-strogonoff',
          'Strogonoff de Frango (exemplo)',
          'protein',
          JSON.stringify([
            { nome: 'Peito de frango', quantidade: 0.5, unidade: 'kg' },
            { nome: 'Creme de leite', quantidade: 200, unidade: 'ml' },
            { nome: 'Molho de tomate', quantidade: 200, unidade: 'ml' },
          ]),
          JSON.stringify([
            'Corte o frango em cubos e tempere com sal.',
            'Refogue e finalize com creme de leite.',
          ]),
          JSON.stringify(['rapida', 'popular']),
          now,
        ],
      )
    }
  } catch (e) {
    console.error('seed global_recipes:', e)
  }

  try {
    await query(`ALTER TABLE recipes ADD COLUMN meal_roles JSONB NOT NULL DEFAULT '[]'::jsonb`)
  } catch (_) {
    /* já existe */
  }
  try {
    await query(`ALTER TABLE recipes ADD COLUMN meal_combo_rules JSONB NOT NULL DEFAULT '{}'::jsonb`)
  } catch (_) {
    /* já existe */
  }
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS platform_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `)
  } catch (_) {
    /* */
  }
  try {
    await query(`ALTER TABLE meal_combinations ADD COLUMN meal_kind TEXT`)
  } catch (_) {
    /* já existe */
  }
  try {
    await query(`ALTER TABLE menus ADD COLUMN meal_kind TEXT`)
  } catch (_) {
    /* já existe */
  }
  try {
    await query(`ALTER TABLE menus ADD COLUMN is_system_default BOOLEAN NOT NULL DEFAULT FALSE`)
  } catch (_) {
    /* já existe */
  }
  try {
    await query(`ALTER TABLE menus ADD COLUMN auto_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE`)
  } catch (_) {
    /* já existe */
  }
  try {
    await query(`ALTER TABLE menus ADD COLUMN required_slots_json JSONB NOT NULL DEFAULT '[]'::jsonb`)
  } catch (_) {
    /* já existe */
  }
  try {
    await query(`
      ALTER TABLE menus ADD COLUMN default_combination_id TEXT
      REFERENCES meal_combinations(id) ON DELETE SET NULL
    `)
  } catch (_) {
    /* já existe */
  }
  try {
    await query(`ALTER TABLE menus ADD COLUMN auto_variations_json JSONB`)
  } catch (_) {
    /* já existe */
  }
  try {
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_menus_owner_meal_kind_unique
      ON menus (owner_user_id, meal_kind)
      WHERE meal_kind IS NOT NULL
        AND meal_kind IN ('cafe_manha', 'almoco', 'jantar', 'lanche')
    `)
  } catch (_) {
    /* */
  }
  try {
    await purgeExtraMenusAndReassignSlots()
  } catch (e) {
    console.error('purgeExtraMenusAndReassignSlots:', e)
  }
  try {
    const { ensureDefaultGlobalRecipeTemplates } = require('./defaultMenus')
    await ensureDefaultGlobalRecipeTemplates(db)
  } catch (e) {
    console.error('ensureDefaultGlobalRecipeTemplates:', e)
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
      INSERT INTO tasks (id, owner_user_id, profile_key, participant_keys_json, title, tag, time_type, time_value, priority, reward, points, done, recurrence, created_at, updated_at)
      VALUES ($1, $2, 'self', '["self"]', 'Organizar agenda', 'Manhã', 'none', '', 0, '', 5, FALSE, 'diario', $3, $4)
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

  try {
    const { ensureDefaultMenusForUser } = require('./defaultMenus')
    await ensureDefaultMenusForUser(userId, executor)
  } catch (e) {
    console.error('ensureDefaultMenusForUser:', e)
  }
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
            INSERT INTO tasks (id, owner_user_id, profile_key, participant_keys_json, title, tag, time_type, time_value, priority, reward, points, done, recurrence, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, 'none', '', 0, '', $7, $8, $9, $10, $11)
          `,
          [uid('task'), task.ownerUserId, task.profileKey, JSON.stringify([task.profileKey]), task.title, task.tag, task.points, task.done, task.recurrence, now, now],
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
            INSERT INTO events (id, owner_user_id, day_key, title, event_time, cls, member_keys_json, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `,
          [uid('evt'), ownerUserId, dayKey, title, time, cls, JSON.stringify(memberKeys), now, now],
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
