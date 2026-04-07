const { many, one, query, db } = require('./db')
const { normalizeMealCategory } = require('./mealCategories')
const { labelForCategory } = require('./mealCategories')
const { DEFAULT_REQUIRED_SLOTS } = require('./defaultMenus')
const { forkGlobalRecipeToUser } = require('./forkGlobalRecipe')
const { categoriesForRecipe, parseJsonArr } = require('./mealsAutoVariationMeta')
const { shouldSkipSlot, sortRequiredForAutoRules, isAssadaProtein } = require('./mealsAutoVariationRules')
const { getLlmApiKeyList, getLlmModel } = require('./platformSettings')
const { buildAlternativesByCategory, refineAutoVariationsWithLlm } = require('./mealsAutoVariationAi')

function poolEntryKey(e) {
  if (e.userRecipeId) return `u:${e.userRecipeId}`
  return `g:${e.globalRecipeId}`
}

function pushPool(pools, cat, entry) {
  if (!pools[cat]) pools[cat] = []
  const k = poolEntryKey(entry)
  if (!pools[cat].some((x) => poolEntryKey(x) === k)) pools[cat].push(entry)
}

function comboRulesFromRow(raw) {
  const o = raw && typeof raw === 'object' ? raw : {}
  return {
    treatAsSaucyProtein: Boolean(o.treatAsSaucyProtein),
    carbIncludesProtein: Boolean(o.carbIncludesProtein),
  }
}

function buildPoolsMerged(userRows, globalRows) {
  const pools = {}
  for (const r of userRows) {
    const entry = {
      userRecipeId: r.id,
      name: r.name || 'Sem nome',
      meta: {
        name: r.name || 'Sem nome',
        recipe_category: r.recipe_category,
        meal_roles: r.meal_roles,
        tags: r.tags,
        mealComboRules: comboRulesFromRow(r.meal_combo_rules ?? r.mealComboRules),
      },
    }
    for (const cat of categoriesForRecipe(r)) {
      pushPool(pools, cat, entry)
    }
  }
  for (const r of globalRows) {
    const entry = {
      globalRecipeId: r.id,
      name: r.name || 'Sem nome',
      meta: {
        name: r.name || 'Sem nome',
        recipe_category: r.recipe_category,
        meal_roles: r.meal_roles,
        tags: r.tags,
        mealComboRules: {},
      },
    }
    for (const cat of categoriesForRecipe(r)) {
      pushPool(pools, cat, entry)
    }
  }
  return pools
}

function mixHash(str) {
  let h = 0
  const s = String(str)
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function pickForCategory(pools, cat, dayIndex, recentByRecipeId, avoidWindow) {
  const pool = [...(pools[cat] || [])]
  if (pool.length === 0) return null
  pool.sort((a, b) => {
    const ka = mixHash(`${poolEntryKey(a)}:${dayIndex}:${cat}`)
    const kb = mixHash(`${poolEntryKey(b)}:${dayIndex}:${cat}`)
    return ka - kb
  })
  const fresh = pool.filter((p) => {
    const last = recentByRecipeId.get(poolEntryKey(p))
    return last === undefined || dayIndex - last >= avoidWindow
  })
  const candidates = fresh.length > 0 ? fresh : pool
  const choice = candidates[dayIndex % candidates.length]
  recentByRecipeId.set(poolEntryKey(choice), dayIndex)
  return choice
}

async function resolvePoolEntry(ownerUserId, entry, forkCache, executor) {
  if (entry.userRecipeId) {
    return { recipeId: entry.userRecipeId, recipeName: entry.name }
  }
  const gid = entry.globalRecipeId
  if (forkCache.has(gid)) {
    const uid = forkCache.get(gid)
    return { recipeId: uid, recipeName: entry.name }
  }
  const uid = await forkGlobalRecipeToUser(ownerUserId, gid, executor)
  if (!uid) return null
  forkCache.set(gid, uid)
  return { recipeId: uid, recipeName: entry.name }
}

function resolvedRequiredSlots(menu) {
  const fromMenu = parseJsonArr(menu.required_slots_json ?? menu.requiredSlots)
  if (fromMenu.length > 0) return fromMenu.map((x) => String(x))
  const kind = menu.meal_kind ?? menu.mealKind
  if (kind && DEFAULT_REQUIRED_SLOTS[kind]) return [...DEFAULT_REQUIRED_SLOTS[kind]]
  return []
}

function insertFarofaAfterCarbOrProtein(slots, farofaSlot) {
  const carbIdx = slots.findIndex((s) => s.mealCategory === 'carb')
  if (carbIdx >= 0) {
    const next = [...slots]
    next.splice(carbIdx + 1, 0, farofaSlot)
    return next
  }
  const protIdx = slots.findIndex((s) => s.mealCategory === 'protein')
  if (protIdx >= 0) {
    const next = [...slots]
    next.splice(protIdx + 1, 0, farofaSlot)
    return next
  }
  return [...slots, farofaSlot]
}

/**
 * Depois dos slots “fixos” do cardápio: se a proteína for assada/grelhada/churrasco e existir pool de farofas, acrescenta um slot.
 */
async function appendFarofaToVariation(ownerUserId, variation, pools, dayIndex, recentFarofa, forkCache, executor) {
  const pool = pools.farofa
  if (!pool || pool.length === 0) return variation
  const slots = variation.slots
  if (!Array.isArray(slots) || slots.some((s) => s.mealCategory === 'farofa')) return variation
  const proteinSlot = slots.find((s) => s.mealCategory === 'protein')
  if (!proteinSlot?.recipeName) return variation
  if (!isAssadaProtein({ name: proteinSlot.recipeName, tags: [], mealComboRules: {} })) return variation
  const pick = pickForCategory(pools, 'farofa', dayIndex, recentFarofa, 5)
  if (!pick) return variation
  const resolved = await resolvePoolEntry(ownerUserId, pick, forkCache, executor)
  if (!resolved) return variation
  const entry = {
    mealCategory: 'farofa',
    recipeId: resolved.recipeId,
    recipeName: resolved.recipeName,
  }
  return {
    ...variation,
    slots: insertFarofaAfterCarbOrProtein(slots, entry),
  }
}

/**
 * @param {string} ownerUserId
 * @param {object} menu - linha menus
 * @param {number} count 1..90
 */
async function generateAutoVariationsForMenu(ownerUserId, menu, count, executor = db) {
  const n = Math.min(90, Math.max(1, Number(count) || 30))
  const required = resolvedRequiredSlots(menu)
  if (required.length === 0) {
    return { error: 'Defina os tipos de prato deste cardápio (edite o cardápio) ou use um cardápio base.' }
  }

  const userRows = await many(
    `
      SELECT id, name, recipe_category,
        COALESCE(meal_roles, '[]'::jsonb) AS meal_roles,
        COALESCE(tags, '[]'::jsonb) AS tags,
        COALESCE(meal_combo_rules, '{}'::jsonb) AS meal_combo_rules
      FROM recipes WHERE owner_user_id = $1
    `,
    [ownerUserId],
    executor,
  )

  const globalRows = await many(
    `
      SELECT id, name, recipe_category,
        COALESCE(tags, '[]'::jsonb) AS tags,
        COALESCE(meal_roles, '[]'::jsonb) AS meal_roles
      FROM global_recipes
    `,
    [],
    executor,
  )

  const pools = buildPoolsMerged(userRows, globalRows)
  const sortedRequired = sortRequiredForAutoRules(required)
  const missing = sortedRequired.filter((c) => !pools[c] || pools[c].length === 0)
  if (missing.length > 0) {
    return {
      error: `Faltam receitas nas categorias: ${missing.map((c) => labelForCategory(c)).join(', ')}. Importa ou cria receitas tuas, ou assegura que o catálogo Tina tem receitas nesses tipos.`,
      missingCategories: missing,
    }
  }

  const recentByRecipeId = new Map()
  const forkCache = new Map()
  const avoidWindow = 6
  const variations = []
  for (let i = 1; i <= n; i += 1) {
    /** @type {{ mealCategory: string, recipeId: string, recipeName: string }[]} */
    const slots = []
    /** @type {Record<string, object>} */
    const pickedMeta = {}
    for (const cat of sortedRequired) {
      if (shouldSkipSlot(cat, pickedMeta)) continue
      const pick = pickForCategory(pools, cat, i, recentByRecipeId, avoidWindow)
      if (!pick) continue
      const resolved = await resolvePoolEntry(ownerUserId, pick, forkCache, executor)
      if (!resolved) continue
      slots.push({
        mealCategory: cat,
        recipeId: resolved.recipeId,
        recipeName: resolved.recipeName,
      })
      pickedMeta[cat] = pick.meta
    }
    variations.push({
      index: i,
      label: `Prato ${i}`,
      slots,
    })
  }

  let finalVariations = variations
  try {
    const apiKeys = await getLlmApiKeyList(executor)
    if (apiKeys.length > 0) {
      const model = await getLlmModel(executor)
      const alt = buildAlternativesByCategory(pools, variations)
      const refined = await refineAutoVariationsWithLlm({
        apiKeys,
        model,
        variations,
        alternativesByCategory: alt,
        mealKind: menu.meal_kind ?? menu.mealKind ?? null,
        menuName: menu.name != null ? String(menu.name) : '',
      })
      if (refined?.length) finalVariations = refined
    }
  } catch (err) {
    console.error('auto-variations LLM refine:', err?.message || err)
  }

  const recentFarofa = new Map()
  const withFarofa = await Promise.all(
    finalVariations.map((v) =>
      appendFarofaToVariation(
        ownerUserId,
        v,
        pools,
        Number(v.index) || 1,
        recentFarofa,
        forkCache,
        executor,
      ),
    ),
  )

  return { variations: withFarofa }
}

/**
 * Normaliza payload do PATCH: lista de { index, label, slots: [{ mealCategory, recipeId, recipeName? }] }
 */
async function saveAutoVariationsForMenu(ownerUserId, menuId, variationsRaw, executor = db) {
  if (!Array.isArray(variationsRaw)) {
    return { error: 'variations deve ser um array.' }
  }
  const recipeIds = new Set()
  for (const v of variationsRaw) {
    const slots = Array.isArray(v.slots) ? v.slots : []
    for (const s of slots) {
      if (s?.recipeId) recipeIds.add(String(s.recipeId))
    }
  }
  if (recipeIds.size > 0) {
    const rows = await many(
      `SELECT id FROM recipes WHERE owner_user_id = $1 AND id = ANY($2::text[])`,
      [ownerUserId, [...recipeIds]],
      executor,
    )
    if (rows.length !== recipeIds.size) {
      return { error: 'Uma ou mais receitas não existem na tua conta.' }
    }
  }

  const normalized = variationsRaw.map((v, idx) => {
    const slots = (Array.isArray(v.slots) ? v.slots : [])
      .filter((s) => s && s.mealCategory && s.recipeId)
      .map((s) => ({
        mealCategory: String(s.mealCategory),
        recipeId: String(s.recipeId),
        recipeName: s.recipeName != null ? String(s.recipeName) : '',
      }))
    return {
      index: Number(v.index) || idx + 1,
      label: String(v.label || `Prato ${idx + 1}`).slice(0, 120),
      slots,
    }
  })

  for (const v of normalized) {
    for (const s of v.slots) {
      if (!s.recipeName && s.recipeId) {
        const r = await one(
          `SELECT name FROM recipes WHERE id = $1 AND owner_user_id = $2`,
          [s.recipeId, ownerUserId],
          executor,
        )
        if (r) s.recipeName = r.name
      }
    }
  }

  await query(
    `UPDATE menus SET auto_variations_json = $1::jsonb WHERE id = $2 AND owner_user_id = $3`,
    [JSON.stringify(normalized), menuId, ownerUserId],
    executor,
  )
  return { variations: normalized }
}

async function pickRandomResolvedRecipeForCategory(ownerUserId, mealCategory, executor = db) {
  const userRows = await many(
    `
      SELECT id, name, recipe_category,
        COALESCE(meal_roles, '[]'::jsonb) AS meal_roles,
        COALESCE(tags, '[]'::jsonb) AS tags,
        COALESCE(meal_combo_rules, '{}'::jsonb) AS meal_combo_rules
      FROM recipes WHERE owner_user_id = $1
    `,
    [ownerUserId],
    executor,
  )
  const globalRows = await many(
    `
      SELECT id, name, recipe_category,
        COALESCE(tags, '[]'::jsonb) AS tags,
        COALESCE(meal_roles, '[]'::jsonb) AS meal_roles
      FROM global_recipes
    `,
    [],
    executor,
  )
  const pools = buildPoolsMerged(userRows, globalRows)
  const pool = pools[mealCategory] || []
  if (pool.length === 0) return null
  const pick = pool[Math.floor(Math.random() * pool.length)]
  const forkCache = new Map()
  return resolvePoolEntry(ownerUserId, pick, forkCache, executor)
}

/**
 * Troca a receita do slot por outra aleatória da mesma categoria (tuas + Tina).
 */
async function randomizePlannerSlotRecipe(ownerUserId, slotId, executor = db) {
  const slot = await one(
    `
      SELECT ms.recipe_id AS "recipeId", r.recipe_category AS "recipeCategory"
      FROM menu_slots ms
      LEFT JOIN recipes r ON r.id = ms.recipe_id AND r.owner_user_id = ms.owner_user_id
      WHERE ms.id = $1 AND ms.owner_user_id = $2
    `,
    [slotId, ownerUserId],
    executor,
  )
  if (!slot?.recipeId) {
    return { error: 'Este lugar não tem receita para aleatorizar. Escolhe “Receita” ao adicionar.' }
  }
  const cat = normalizeMealCategory(slot.recipeCategory)
  if (!cat) {
    return { error: 'Define a categoria da receita em Receitas para podermos sugerir troca na mesma família.' }
  }
  let picked = null
  for (let attempt = 0; attempt < 12; attempt++) {
    picked = await pickRandomResolvedRecipeForCategory(ownerUserId, cat, executor)
    if (picked && picked.recipeId !== slot.recipeId) break
  }
  if (!picked) {
    picked = await pickRandomResolvedRecipeForCategory(ownerUserId, cat, executor)
  }
  if (!picked) {
    return { error: 'Não há outras receitas nesta categoria (cria ou importa da Tina).' }
  }
  await query(
    `UPDATE menu_slots SET recipe_id = $1, custom_title = NULL WHERE id = $2 AND owner_user_id = $3`,
    [picked.recipeId, slotId, ownerUserId],
    executor,
  )
  return { recipeId: picked.recipeId, recipeName: picked.recipeName }
}

module.exports = {
  generateAutoVariationsForMenu,
  saveAutoVariationsForMenu,
  resolvedRequiredSlots,
  buildPoolsMerged,
  pickRandomResolvedRecipeForCategory,
  randomizePlannerSlotRecipe,
}
