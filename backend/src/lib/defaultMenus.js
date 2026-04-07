const { query, one, uid, db, value } = require('./db')
const { forkGlobalRecipeToUser } = require('./forkGlobalRecipe')

/** Tipos de cardápio base (um por utilizador cada). */
const MEAL_KINDS = ['cafe_manha', 'almoco', 'jantar', 'lanche']

const MENU_LABEL = {
  cafe_manha: 'Café da manhã',
  almoco: 'Almoço',
  jantar: 'Jantar',
  lanche: 'Lanche',
}

/** Slots sugeridos para o modo automático e para o gerador de 30 pratos. */
const DEFAULT_REQUIRED_SLOTS = {
  cafe_manha: ['protein', 'bebida', 'lanche'],
  almoco: ['carb', 'leguminosas', 'protein', 'legumes', 'salada'],
  jantar: ['carb', 'leguminosas', 'protein', 'legumes', 'salada'],
  lanche: ['bebida', 'lanche'],
}

const FORK_CATEGORIES_ONCE = ['carb', 'leguminosas', 'protein', 'farofa', 'legumes', 'salada', 'bebida', 'lanche']

const FALLBACK_GLOBAL_BY_CAT = {
  protein: ['glob-demo-strogonoff', 'glob-seed-ovo'],
  carb: ['glob-seed-arroz'],
  leguminosas: ['glob-seed-feijao'],
  farofa: ['glob-seed-farofa'],
  legumes: ['glob-seed-legumes'],
  salada: ['glob-seed-salada'],
  bebida: ['glob-seed-suco'],
  lanche: ['glob-seed-lanche'],
}

async function forkFirstMatchingGlobal(ownerUserId, mealCategory, executor) {
  const row = await one(
    `SELECT id FROM global_recipes WHERE recipe_category = $1 ORDER BY id ASC LIMIT 1`,
    [mealCategory],
    executor,
  )
  if (row) {
    const id = await forkGlobalRecipeToUser(ownerUserId, row.id, executor)
    if (id) return id
  }
  const fallbacks = FALLBACK_GLOBAL_BY_CAT[mealCategory] || ['glob-demo-strogonoff']
  for (const gid of fallbacks) {
    const id = await forkGlobalRecipeToUser(ownerUserId, gid, executor)
    if (id) return id
  }
  return null
}

/**
 * Se o utilizador ainda não tem receitas, copia modelos Tina por categoria (uma vez).
 */
async function ensureSeedRecipesIfEmpty(ownerUserId, executor) {
  const cnt = await value(`SELECT COUNT(*)::int FROM recipes WHERE owner_user_id = $1`, [ownerUserId], executor)
  if (Number(cnt) > 0) return
  for (const cat of FORK_CATEGORIES_ONCE) {
    await forkFirstMatchingGlobal(ownerUserId, cat, executor)
  }
}

async function createMenuOnlyForKind(ownerUserId, kind, sortOrder, executor) {
  const now = new Date().toISOString()
  const menuId = uid('menu')
  const reqSlots = JSON.stringify(DEFAULT_REQUIRED_SLOTS[kind] || [])
  const name = MENU_LABEL[kind] || kind

  await query(
    `
      INSERT INTO menus (
        id, owner_user_id, name, sort_order, created_at,
        meal_kind, is_system_default, auto_mode_enabled, required_slots_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, $7::jsonb)
    `,
    [menuId, ownerUserId, name, sortOrder, now, kind, reqSlots],
    executor,
  )
}

/**
 * Receitas globais mínimas (migrate). Chamado na migrate.
 */
async function ensureDefaultGlobalRecipeTemplates(executor = db) {
  const now = new Date().toISOString()
  const seeds = [
    {
      id: 'glob-seed-arroz',
      name: 'Arroz branco (base)',
      cat: 'carb',
      ing: [{ nome: 'Arroz', quantidade: 2, unidade: 'xicara' }, { nome: 'Água', quantidade: 4, unidade: 'xicara' }],
      steps: ['Lave o arroz.', 'Cozinhe em água fervente até secar.'],
    },
    {
      id: 'glob-seed-feijao',
      name: 'Feijão cozido (base)',
      cat: 'leguminosas',
      ing: [{ nome: 'Feijão demolhado', quantidade: 2, unidade: 'xicara' }, { nome: 'Água', quantidade: 1, unidade: 'l' }],
      steps: ['Coza o feijão em panela de pressão até ficar macio.'],
    },
    {
      id: 'glob-seed-farofa',
      name: 'Farofa simples (base)',
      cat: 'farofa',
      ing: [
        { nome: 'Farinha de mandioca torrada', quantidade: 1, unidade: 'xicara' },
        { nome: 'Manteiga', quantidade: 2, unidade: 'colher_sopa' },
      ],
      steps: ['Aqueça a manteiga, junte a farinha aos poucos e mexa até soltar do fundo.'],
    },
    {
      id: 'glob-seed-legumes',
      name: 'Refogado de legumes (base)',
      cat: 'legumes',
      ing: [{ nome: 'Legumes variados', quantidade: 400, unidade: 'g' }],
      steps: ['Refogue os legumes com azeite até ficarem macios.'],
    },
    {
      id: 'glob-seed-salada',
      name: 'Salada verde (base)',
      cat: 'salada',
      ing: [{ nome: 'Folhas verdes', quantidade: 1, unidade: 'un' }, { nome: 'Azeite', quantidade: 1, unidade: 'colher_sopa' }],
      steps: ['Lave as folhas e tempere com azeite e limão.'],
    },
    {
      id: 'glob-seed-suco',
      name: 'Suco de fruta (base)',
      cat: 'bebida',
      ing: [{ nome: 'Fruta', quantidade: 2, unidade: 'un' }],
      steps: ['Bata no liquidificador com água ou use natural.'],
    },
    {
      id: 'glob-seed-lanche',
      name: 'Lanche leve (base)',
      cat: 'lanche',
      ing: [{ nome: 'Pão integral', quantidade: 2, unidade: 'un' }],
      steps: ['Sirva com o que tiver em casa.'],
    },
    {
      id: 'glob-seed-ovo',
      name: 'Ovos preparados (base)',
      cat: 'protein',
      ing: [{ nome: 'Ovos', quantidade: 2, unidade: 'un' }],
      steps: ['Cozinhe como preferir (cozidos, mexidos ou omelete).'],
    },
  ]

  for (const s of seeds) {
    await query(
      `
        INSERT INTO global_recipes (id, name, recipe_category, ingredients, steps, tags, created_at)
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, '[]'::jsonb, $6)
        ON CONFLICT (id) DO NOTHING
      `,
      [s.id, s.name, s.cat, JSON.stringify(s.ing), JSON.stringify(s.steps), now],
      executor,
    )
  }
}

/**
 * Garante os 4 cardápios base (sem criar “Pratos” / combinações fixas — isso é Modo automático).
 */
async function ensureDefaultMenusForUser(ownerUserId, executor = db) {
  const maxRow = await one(
    `SELECT COALESCE(MAX(sort_order), -1) AS m FROM menus WHERE owner_user_id = $1`,
    [ownerUserId],
    executor,
  )
  let sortBase = Number(maxRow?.m ?? -1) + 1
  let createdAny = false

  for (const kind of MEAL_KINDS) {
    const exists = await one(
      `SELECT id FROM menus WHERE owner_user_id = $1 AND meal_kind = $2`,
      [ownerUserId, kind],
      executor,
    )
    if (exists) continue
    await createMenuOnlyForKind(ownerUserId, kind, sortBase, executor)
    sortBase += 1
    createdAny = true
  }

  if (createdAny) {
    await ensureSeedRecipesIfEmpty(ownerUserId, executor)
  }
}

/** Tipo de slot no planeador (UI) consoante o cardápio base. */
function mealKindToPlannerSlotType(mealKind) {
  const k = String(mealKind || '')
  if (k === 'cafe_manha') return 'breakfast'
  if (k === 'almoco') return 'lunch'
  if (k === 'jantar') return 'dinner'
  if (k === 'lanche') return 'snack'
  return 'meal'
}

/** Inverso de mealKindToPlannerSlotType: usado ao migrar slots para os 4 cardápios base. */
function plannerSlotTypeToMealKind(slotType) {
  const s = String(slotType || '')
  if (s === 'breakfast') return 'cafe_manha'
  if (s === 'lunch') return 'almoco'
  if (s === 'dinner') return 'jantar'
  if (s === 'snack') return 'lanche'
  return 'almoco'
}

module.exports = {
  MEAL_KINDS,
  MENU_LABEL,
  DEFAULT_REQUIRED_SLOTS,
  mealKindToPlannerSlotType,
  plannerSlotTypeToMealKind,
  ensureDefaultGlobalRecipeTemplates,
  ensureDefaultMenusForUser,
}
