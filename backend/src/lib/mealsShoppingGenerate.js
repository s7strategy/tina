const { many, one } = require('./db')
const { getFamilyMealSettings, DEFAULT_SPOONS } = require('./mealsFamilyPortions')
const { isWholeRecipeYieldCategory } = require('./mealCategories')

const APP_TZ = process.env.APP_TZ || 'America/Sao_Paulo'

/**
 * Folga nas quantidades agregadas (alinhado ao frontend `FAMILY_INGREDIENT_SCALE_MARGIN` em recipeScaling.js).
 * Não aplicado a doces, bebidas/sucos nem molhos (uma receita inteira por vez).
 */
const FAMILY_FOOD_MARGIN = 1.08

function ymdAppTz(d) {
  return d.toLocaleDateString('en-CA', { timeZone: APP_TZ })
}

/** Tenta interpretar quantidade numérica (vírgula ou ponto). */
function tryParseQuantity(q) {
  if (q == null || String(q).trim() === '') return null
  const t = String(q).replace(',', '.').trim()
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : null
}

/**
 * Formata número para texto na lista (evita o bug de "240" → "24" ao cortar zeros
 * sem ponto decimal; inteiros nunca passam por regex).
 */
function formatQtyNumber(n) {
  if (!Number.isFinite(n)) return ''
  const r = Math.round(n * 1000) / 1000
  if (Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r))
  const s = String(r)
  if (!s.includes('.')) return s
  return s.replace(/\.?0+$/, '').replace(/\.$/, '')
}

/** Conversões fixas (sem configurar na receita): col. sopa 50 g, col. chá 4 g; g/ml/kg automáticos. */
const GRAMS_PER_SOUP_SPOON = 50
const GRAMS_PER_TEA_SPOON = 4

/**
 * Converte o que cada pessoa come para kg de prato (receita escrita para 1 kg).
 */
function kgPerPerson(servings, amountUnit) {
  const s = Number(servings)
  if (!Number.isFinite(s) || s <= 0) return 0
  let u = String(amountUnit || 'kg').toLowerCase()
  if (u === 'portion') u = 'kg'
  if (u === 'kg' || u === '') return s
  if (u === 'g') return s / 1000
  if (u === 'ml') return s / 1000
  if (u === 'cs') return (s * GRAMS_PER_SOUP_SPOON) / 1000
  if (u === 'cc') return (s * GRAMS_PER_TEA_SPOON) / 1000
  return 0
}

/** Nome estável para juntar "Carne", "carne", "carne  " entre receitas. */
function normalizeIngredientName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
}

/** Alinha unidades do catálogo JSON / formulário às chaves usadas em gramas. */
function normalizeMassUnit(unit) {
  const u = String(unit || '').trim().toLowerCase()
  if (!u) return ''
  if (u === 'g' || u === 'grama' || u === 'gramas') return 'g'
  if (u === 'kg' || u === 'quilo' || u === 'kilos') return 'kg'
  if (u === 'cs' || u.includes('colher_sopa') || u.includes('colheres_sopa') || u === 'colsopa') return 'cs'
  if (u === 'cc' || u.includes('colher_cha') || u.includes('colher_chá') || u.includes('colheres_cha')) return 'cc'
  if (u === 'colher' || u === 'colheres') return 'cs'
  return u
}

/**
 * Quantidade do ingrediente em gramas por 1 kg de prato pronto (modo avançado).
 * kg no ingrediente = kg de ingrediente por 1 kg de prato → ×1000 g.
 */
function gramsPerBaseDishKg(qNum, unit) {
  const u = normalizeMassUnit(unit)
  if (u === 'g') return qNum
  if (u === 'kg') return qNum * 1000
  if (u === 'cs') return qNum * GRAMS_PER_SOUP_SPOON
  if (u === 'cc') return qNum * GRAMS_PER_TEA_SPOON
  return null
}

function mlPerBaseDishKg(qNum, unit) {
  const u = String(unit || '').trim().toLowerCase()
  if (u === 'ml') return qNum
  if (u === 'l' || u === 'lt' || u === 'litro' || u === 'litros') return qNum * 1000
  return null
}

function formatMassFromTotalGrams(totalGrams) {
  if (!Number.isFinite(totalGrams) || totalGrams < 0) {
    return { quantityText: '', unit: 'g' }
  }
  if (totalGrams >= 1000) {
    return { quantityText: formatQtyNumber(totalGrams / 1000), unit: 'kg' }
  }
  // Gramas: inteiro arredondado, sem regex (ex.: 240.4 g → "240")
  return { quantityText: String(Math.round(totalGrams)), unit: 'g' }
}

/**
 * Agrega ingredientes de receitas nos slots do planejador.
 * - `horizonDays` (7|15|30): de hoje até hoje+N-1.
 * - `{ periodStart, periodEnd }` (YYYY-MM-DD): intervalo explícito (ex.: mês escolhido no planeador).
 * Modo avançado: ingredientes por 1 kg de prato → base de escala = 1 kg.
 */
async function generateShoppingItemsFromPlanner(ownerUserId, horizonDaysOrPeriod = 7) {
  let startYmd
  let endYmd
  if (
    horizonDaysOrPeriod &&
    typeof horizonDaysOrPeriod === 'object' &&
    horizonDaysOrPeriod.periodStart &&
    horizonDaysOrPeriod.periodEnd
  ) {
    startYmd = String(horizonDaysOrPeriod.periodStart).slice(0, 10)
    endYmd = String(horizonDaysOrPeriod.periodEnd).slice(0, 10)
  } else {
    const days = [7, 15, 30].includes(Number(horizonDaysOrPeriod)) ? Number(horizonDaysOrPeriod) : 7
    const today = new Date()
    startYmd = ymdAppTz(today)
    const endDate = new Date(today.getTime() + (days - 1) * 86400000)
    endYmd = ymdAppTz(endDate)
  }

  const slots = await many(
    `
      SELECT recipe_id AS "recipeId"
      FROM menu_slots
      WHERE owner_user_id = $1
        AND plan_date >= $2::date
        AND plan_date <= $3::date
        AND recipe_id IS NOT NULL
    `,
    [ownerUserId, startYmd, endYmd],
  )

  if (!slots.length) {
    return []
  }

  const recipeCounts = {}
  for (const s of slots) {
    const rid = s.recipeId
    recipeCounts[rid] = (recipeCounts[rid] || 0) + 1
  }

  /** mass: Map key mass:${norm} -> { name, grams } */
  const massMap = new Map()
  /** ml: Map key ml:${norm} -> { name, ml } */
  const mlMap = new Map()
  /** legado / texto: chave composta */
  const otherMap = new Map()

  let cachedFamilyKg = null
  async function resolveFamilyPlateKg() {
    if (cachedFamilyKg != null) return cachedFamilyKg
    const settings = await getFamilyMealSettings(ownerUserId)
    if (!settings.autoActive) {
      cachedFamilyKg = 0
      return 0
    }
    const mems = await many(
      `SELECT id FROM members WHERE owner_user_id = $1 ORDER BY sort_order ASC`,
      [ownerUserId],
    )
    let sum = 0
    for (const m of mems) {
      const sp = Number(settings.memberSpoons[m.id])
      const s = Number.isFinite(sp) && sp > 0 ? sp : DEFAULT_SPOONS
      sum += kgPerPerson(s, 'cs')
    }
    cachedFamilyKg = sum
    return sum
  }

  for (const [recipeId, occurrences] of Object.entries(recipeCounts)) {
    const recipe = await one(
      `SELECT id, base_servings, mode, servings_source, recipe_category FROM recipes WHERE id = $1 AND owner_user_id = $2`,
      [recipeId, ownerUserId],
    )
    if (!recipe) continue

    const isAdvanced = String(recipe.mode || '').trim().toLowerCase() === 'advanced'
    const isWholeRecipe = isWholeRecipeYieldCategory(recipe.recipe_category)
    let baseKg = Number(recipe.base_servings) > 0 ? Number(recipe.base_servings) : 1
    if (isAdvanced) {
      baseKg = 1
    }

    let totalKg = 0
    if (String(recipe.servings_source || '').trim() === 'family') {
      const fk = await resolveFamilyPlateKg()
      totalKg = fk > 0 ? fk : 0
    } else {
      const memberRows = await many(
        `SELECT servings, amount_unit AS "amountUnit" FROM recipe_member_servings WHERE recipe_id = $1`,
        [recipeId],
      )
      for (const row of memberRows) {
        totalKg += kgPerPerson(row.servings, row.amountUnit)
      }
    }
    const effectiveKg = totalKg > 0 ? totalKg : baseKg
    /** Doces, bebidas/sucos, molhos: 1 receita inteira por vez (não escalar por pessoas). */
    const scalePerMeal = isWholeRecipe
      ? 1
      : (effectiveKg / baseKg) * FAMILY_FOOD_MARGIN
    const totalScale = scalePerMeal * occurrences

    const ingredients = await many(
      `
        SELECT name, quantity, unit, sort_order
        FROM recipe_ingredients
        WHERE recipe_id = $1
        ORDER BY sort_order ASC
      `,
      [recipeId],
    )

    for (const ing of ingredients) {
      const rawName = String(ing.name || '').trim()
      if (!rawName) continue
      const unit = ing.unit != null ? String(ing.unit).trim().toLowerCase() : ''
      const qNum = tryParseQuantity(ing.quantity)
      const norm = normalizeIngredientName(rawName)

      const gBase = qNum != null ? gramsPerBaseDishKg(qNum, unit) : null
      if (gBase != null) {
        const key = `mass:${norm}`
        const prev = massMap.get(key) || { name: rawName, grams: 0 }
        prev.grams += gBase * totalScale
        massMap.set(key, prev)
        continue
      }

      const mlBase = qNum != null ? mlPerBaseDishKg(qNum, unit) : null
      if (mlBase != null) {
        const key = `ml:${norm}`
        const prev = mlMap.get(key) || { name: rawName, ml: 0 }
        prev.ml += mlBase * totalScale
        mlMap.set(key, prev)
        continue
      }

      const key = `${norm}|${unit}`
      const prev = otherMap.get(key) || { name: rawName, unit, numeric: null, textParts: [] }

      if (qNum != null) {
        prev.numeric = (prev.numeric || 0) + qNum * totalScale
      } else if (String(ing.quantity || '').trim()) {
        prev.textParts.push(`${String(ing.quantity).trim()} (${occurrences}x receita)`)
      } else {
        prev.textParts.push(`(${occurrences}x)`)
      }
      otherMap.set(key, prev)
    }
  }

  const out = []

  for (const [, v] of massMap) {
    const { quantityText, unit } = formatMassFromTotalGrams(v.grams)
    out.push({
      name: v.name,
      quantityText,
      unit,
    })
  }

  for (const [, v] of mlMap) {
    let quantityText = ''
    if (v.ml != null && v.ml > 0) {
      quantityText = formatQtyNumber(v.ml)
    }
    out.push({
      name: v.name,
      quantityText,
      unit: 'ml',
    })
  }

  for (const [, v] of otherMap) {
    let quantityText = ''
    if (v.numeric != null && v.numeric > 0) {
      quantityText = formatQtyNumber(v.numeric)
    } else if (v.textParts.length) {
      quantityText = v.textParts.join('; ')
    } else {
      quantityText = ''
    }
    out.push({
      name: v.name,
      quantityText,
      unit: v.unit || null,
    })
  }

  out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return out
}

module.exports = {
  generateShoppingItemsFromPlanner,
  ymdAppTz,
}
