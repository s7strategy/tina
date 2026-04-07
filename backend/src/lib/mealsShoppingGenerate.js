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
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
}

/**
 * Lista de compras: só o insumo/produto — remove trechos entre parênteses
 * (unidades abreviadas, instruções), colchetes, sufixos "ou até…" e prefixos "de/da/do".
 */
function stripIngredientLabelToProduct(rawName) {
  let s = String(rawName || '').replace(/\u00a0/g, ' ').trim()
  if (!s) return ''
  let guard = 0
  while (/\([^)]*\)/.test(s) && guard++ < 40) {
    s = s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  }
  guard = 0
  while (/\[[^\]]*\]/.test(s) && guard++ < 20) {
    s = s.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim()
  }
  s = s.replace(/\s+ou\s+at[eé]\b.*$/i, '').trim()
  s = s.replace(/\s+at[eé]\s+ficar\b.*$/i, '').trim()
  for (let k = 0; k < 8; k++) {
    const n = s.replace(/^(de|da|do|dos|das)\s+/i, '').trim()
    if (n === s) break
    s = n
  }
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

/** Frases de preparo/corte (remover antes dos tokens soltos; ordem: mais longo primeiro). */
const INGREDIENT_PREP_PHRASES = [
  /\bcortad[oa]s?\s+em\s+fatias?\s+finas?\b/gi,
  /\bcortad[oa]s?\s+em\s+fatias?\b/gi,
  /\bfatiad[oa]s?\s+em\s+fatias?\s+finas?\b/gi,
  /\bfatiad[oa]s?\s+em\s+fatias?\b/gi,
  /\bem\s+fatias?\s+finas?\b/gi,
  /\bem\s+fatias?\b/gi,
  /\bfatias?\s+finas?\b/gi,
  /\bem\s+rodelas?\b/gi,
  /\bem\s+meia\s+lua\b/gi,
  /\bem\s+lascas?\b/gi,
  /\bem\s+julienne\b/gi,
  /\bcortad[oa]s?\s+em\s+cubos?\b/gi,
  /\bfres(?:co|ca)\s+em\s+cubos?\b/gi,
  /\bem\s+cubos?\s+(pequenos?|grandes?|m[eé]dios?)\b/gi,
  /\bem\s+conserva\b/gi,
]

/**
 * Chave para fundir o mesmo insumo escrito de formas diferentes
 * ("Cebola média picada", "Cebola", "Alho socado" → cebola / alho).
 */
function canonicalIngredientKey(rawName) {
  let s = normalizeIngredientName(rawName)
  if (!s) return ''
  s = s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  s = s.replace(/^\d+[,.]?\d*\s*%?\s*/, '').trim()
  for (let pass = 0; pass < 10; pass += 1) {
    const before = s
    for (const ph of INGREDIENT_PREP_PHRASES) {
      s = s.replace(ph, ' ').replace(/\s+/g, ' ').trim()
    }
    if (s === before) break
  }
  const descriptors =
    /\b(picad[oa]s?|ralad[oa]s?|fatiad[oa]s?|cortad[oa]s?|em cubos?|em cubinhos?|m[oô]id[oa]s?|triturad[oa]s?|desfiad[oa]s?|socad[oa]s?|amassad[oa]s?|peneirad[oa]s?|grelhad[oa]s?|assad[oa]s?|fervid[oa]s?|cozid[oa]s?|refogad[oa]s?|torrad[oa]s?|dou?rad[oa]s?|al dente|em rodelas?|em tiras?|em peda[cç]os?|descascad[oa]s?|sem pele|sem sementes?|madur[oa]s?|fres(?:co|ca|cos|cas)|congelad[oa]s?|descongelad[oa]s?|demolhad[oa]s?|lavad[oa]s?|escorrido?s?|temperad[oa]s?|marinad[oa]s?|baby|em pedacin(?:hos?)?|em tirinhas?)\b/gi
  for (let pass = 0; pass < 12; pass += 1) {
    const before = s
    s = s.replace(descriptors, ' ').replace(/\s+/g, ' ').trim()
    if (s === before) break
  }
  s = s.replace(/\s+a gosto\s*$/i, '').trim()
  s = s.replace(/\s*,\s*/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s) return normalizeIngredientName(rawName)
  return s
}

/** Junta plural comum na última palavra (abobrinhas→abobrinha, tomates→tomate, ovos→ovo). */
function mergePluralStem(canon) {
  const parts = String(canon || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return String(canon || '').trim()
  let w = parts[parts.length - 1]
  if (w.length < 4) return parts.join(' ')
  if (/ões$|ães$/i.test(w)) return parts.join(' ')
  if (/tes$/i.test(w) && w.length >= 5) {
    w = w.slice(0, -1)
  } else if (/as$/i.test(w) && w.length >= 7) {
    w = w.slice(0, -1)
  } else if (/os$/i.test(w) && w.length >= 4) {
    w = w.slice(0, -1)
  }
  parts[parts.length - 1] = w
  return parts.join(' ')
}

/** Nome legível na lista (Title case pt-BR). */
function prettyIngredientLabel(name) {
  const s = String(name || '')
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
  if (!s) return ''
  return s
    .split(' ')
    .filter(Boolean)
    .map((p) => p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1).toLocaleLowerCase('pt-BR'))
    .join(' ')
}

/** Chave final: canónico + reduce plural (uma entrada por insumo “base”). */
function ingredientMergeKey(rawName) {
  const cleaned = stripIngredientLabelToProduct(rawName)
  const source =
    cleaned || String(rawName || '').replace(/\u00a0/g, ' ').trim()
  const base = canonicalIngredientKey(source) || normalizeIngredientName(source)
  return mergePluralStem(base)
}

/** Agrupa unidades equivalentes para somar quantidades na mesma linha. */
function normalizeUnitMergeKey(unitRaw) {
  const u = String(unitRaw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  if (u === 'a_gosto') return 'a_gosto'
  if (!u) return 'un'
  if (u === 'un' || u === 'unidade' || u === 'und' || u === 'uni' || u === 'unit' || u === 'units') return 'un'
  if (u.includes('dente')) return 'dente'
  if (u.includes('folha')) return 'folha'
  if (u.includes('ramo')) return 'ramo'
  if (u.includes('maco') || u.includes('maço')) return 'maco'
  if (u.includes('xicara') || u.includes('xícara') || u === 'xic' || /^xic(cha)?$/.test(u)) return 'xicara'
  if (u.includes('colher_sopa') || u.includes('colheres_sopa') || u === 'colsopa' || u === 'cs' || u === 'colher' || u === 'colheres') return 'colher_sopa'
  if (u.includes('colher_cha') || u.includes('colher_chá') || u.includes('colheres_cha') || u === 'cc') return 'colher_cha'
  if (u === 'pitada' || u.includes('pitadas')) return 'pitada'
  if (u === 'l' || u === 'lt' || u === 'litro' || u === 'litros') return 'l'
  return u
}

function friendlyUnitLabel(unitKey) {
  const k = String(unitKey || '')
  if (k === 'un') return 'un'
  if (k === 'dente') return 'dentes'
  if (k === 'folha') return 'folhas'
  if (k === 'maco') return 'maço'
  if (k === 'xicara') return 'xíc.'
  if (k === 'colher_sopa') return 'col. sopa'
  if (k === 'colher_cha') return 'col. chá'
  if (k === 'pitada') return 'pitadas'
  if (k === 'l') return 'L'
  return k || 'un'
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

/** Volume total em ml → texto (≥1 L mostra em litros, como uma unidade legível). */
function formatLiquidMlTotal(totalMl) {
  if (!Number.isFinite(totalMl) || totalMl <= 0) return { text: '', unitForUi: 'ml' }
  if (totalMl >= 1000) {
    return { text: `${formatQtyNumber(totalMl / 1000)} L`.trim(), unitForUi: 'L' }
  }
  return { text: `${formatQtyNumber(totalMl)} ml`.trim(), unitForUi: 'ml' }
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

  /** Uma linha por insumo: gramas + ml + outras unidades fundidas. */
  const agg = new Map()

  /** Nome na lista = insumo fundido (chave), não o texto cru da receita — evita “Abacaxi Fresco Em Cubos” quando a chave é “abacaxi”. */
  function touchAgg(keyCanon) {
    const display = prettyIngredientLabel(keyCanon)
    let e = agg.get(keyCanon)
    if (!e) {
      e = { name: display, grams: 0, ml: 0, byUnit: new Map() }
      agg.set(keyCanon, e)
    } else {
      e.name = display
    }
    return e
  }

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
      const mergeKey = ingredientMergeKey(rawName)

      const gBase = qNum != null ? gramsPerBaseDishKg(qNum, unit) : null
      if (gBase != null) {
        const e = touchAgg(mergeKey)
        e.grams += gBase * totalScale
        continue
      }

      const mlBase = qNum != null ? mlPerBaseDishKg(qNum, unit) : null
      if (mlBase != null) {
        const e = touchAgg(mergeKey)
        e.ml += mlBase * totalScale
        continue
      }

      const uKey = normalizeUnitMergeKey(unit)
      const e = touchAgg(mergeKey)
      let uEnt = e.byUnit.get(uKey)
      if (!uEnt) {
        uEnt = { sum: 0, texts: [] }
        e.byUnit.set(uKey, uEnt)
      }
      if (qNum != null && Number.isFinite(qNum)) {
        uEnt.sum += qNum * totalScale
      } else if (String(ing.quantity || '').trim()) {
        const fragment = String(ing.quantity).trim()
        if (!uEnt.texts.includes(fragment)) uEnt.texts.push(fragment)
      }
    }
  }

  const otherUnitOrder = [
    'kg',
    'g',
    'ml',
    'l',
    'xicara',
    'colher_sopa',
    'colher_cha',
    'un',
    'dente',
    'folha',
    'maco',
    'pitada',
    'a_gosto',
  ]

  const out = []

  for (const [, entry] of agg) {
    const qtyParts = []
    if (entry.grams > 0) {
      const { quantityText: qMass, unit: uMass } = formatMassFromTotalGrams(entry.grams)
      if (qMass) qtyParts.push(`${qMass} ${uMass}`.trim())
    }
    if (entry.ml > 0) {
      qtyParts.push(formatLiquidMlTotal(entry.ml).text)
    }

    const keys = [...entry.byUnit.keys()].sort((a, b) => {
      const ia = otherUnitOrder.indexOf(a)
      const ib = otherUnitOrder.indexOf(b)
      const da = ia === -1 ? 999 : ia
      const db = ib === -1 ? 999 : ib
      return da - db || String(a).localeCompare(String(b))
    })
    for (const uk of keys) {
      const v = entry.byUnit.get(uk)
      if (!v) continue
      if (uk === 'a_gosto' && v.sum <= 0 && v.texts.length === 0) {
        if (!qtyParts.includes('a gosto')) qtyParts.push('a gosto')
        continue
      }
      if (v.sum > 0) {
        const lbl = friendlyUnitLabel(uk)
        qtyParts.push(`${formatQtyNumber(v.sum)} ${lbl}`.trim())
      }
      for (const t of v.texts) {
        if (t && !qtyParts.includes(t)) qtyParts.push(t)
      }
    }

    const nGrams = entry.grams > 0 ? 1 : 0
    const nMl = entry.ml > 0 ? 1 : 0
    const nOtherNum = [...entry.byUnit.values()].filter((v) => v && v.sum > 0).length
    let primaryUnit = null
    if (nGrams + nMl + nOtherNum === 1) {
      if (nGrams) {
        primaryUnit = formatMassFromTotalGrams(entry.grams).unit
      } else if (nMl) {
        primaryUnit = formatLiquidMlTotal(entry.ml).unitForUi
      } else if (entry.byUnit.size === 1 && keys.length === 1) {
        const only = keys[0]
        const v = entry.byUnit.get(only)
        if (v && v.sum > 0 && v.texts.length === 0 && (only === 'un' || only === 'dente')) {
          primaryUnit = 'un'
        }
      }
    }

    out.push({
      name: prettyIngredientLabel(entry.name),
      quantityText: qtyParts.join(' + '),
      unit: primaryUnit,
    })
  }

  out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return out
}

module.exports = {
  generateShoppingItemsFromPlanner,
  ymdAppTz,
  stripIngredientLabelToProduct,
}
