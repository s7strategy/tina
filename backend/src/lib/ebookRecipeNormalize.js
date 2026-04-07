const { normalizeMealCategory } = require('./mealCategories')
const { normalizeTagsArray } = require('./recipeTags')

/**
 * Normaliza categoria + meal_roles ao importar receitas do ebook JSON.
 * Objectivo: carb = arroz, massa base, purês, acompanhamentos de almoço/jantar; prato único massa+proteína
 * → proteína + papel carb; lasanhas de vegetais → legumes; lanches/pãos/pipoca/crepioca em carb → lanche.
 */
function carbInEbookLooksLikeLanche(name, n) {
  if (/\bcrepioca\b|\bbeiju\b/i.test(name)) return true
  if (/\bpipoca\b/i.test(n)) return true
  if (/\bwrap\b/i.test(n)) return true
  if (/sandu[ií]che|\bmisto quente\b|torrad(as|inha)?\b/i.test(n)) return true
  if (/panqueca de (banana|cacau|aveia|ma[cç][aã]|chocolate|frutas)/i.test(name)) return true

  // Receita cujo título é pão (rápido, de queijo, sem glúten…). Sobremesas “com pão” no livro vêm em Doces.
  if (/^p[aã]o(\s| de )/i.test(name)) return true

  return false
}

/** Slug estável vindo de `receitas_tina_completo.json` (taxonomia Tina). */
function slugifyCategoriaKey(categoria) {
  return String(categoria || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
}

const EBOOK_EXPLICIT_SIMPLE = new Set([
  'protein',
  'carb',
  'legumes',
  'leguminosas',
  'farofa',
  'salada',
  'lanche',
  'bebida',
  'sopa',
  'molhos',
  'doces',
  'outro',
])

function normalizeEbookRecipeForSeed({ nome, categoria, tags }) {
  const name = String(nome || '').trim()
  const n = name.toLowerCase()
  const catKey = slugifyCategoriaKey(categoria)
  const tagsBase = Array.isArray(tags) ? tags : []

  const isFeijaoBeanDish = /\bfeij[aã]o\b/i.test(n) && !/\bfeij[aã]o verde\b/i.test(n)
  if (isFeijaoBeanDish && (catKey === 'carb' || catKey === 'protein_carb')) {
    return {
      recipe_category: 'leguminosas',
      meal_roles: [],
      tags: normalizeTagsArray([...tagsBase, ...(catKey === 'protein_carb' ? ['com-carb'] : [])]),
    }
  }

  const isFarofaTitle = /^farofa\b/i.test(n)
  if (isFarofaTitle && (catKey === 'carb' || catKey === 'protein_carb')) {
    return {
      recipe_category: 'farofa',
      meal_roles: [],
      tags: normalizeTagsArray(tagsBase),
    }
  }

  // Prato principal proteína com papel de carboidrato (arroz/massa no mesmo prato, etc.)
  if (catKey === 'protein_carb') {
    return {
      recipe_category: 'protein',
      meal_roles: ['carb'],
      tags: normalizeTagsArray([...tagsBase, 'com-carb']),
    }
  }

  if (EBOOK_EXPLICIT_SIMPLE.has(catKey)) {
    let recipe_category = normalizeMealCategory(catKey) || catKey
    if (recipe_category === 'carb' && carbInEbookLooksLikeLanche(name, n)) {
      return {
        recipe_category: 'lanche',
        meal_roles: [],
        tags: normalizeTagsArray(tagsBase),
      }
    }
    return {
      recipe_category,
      meal_roles: [],
      tags: normalizeTagsArray(tagsBase),
    }
  }

  const rawCat = normalizeMealCategory(categoria) || 'outro'

  let recipe_category = rawCat
  /** @type {string[]} */
  let meal_roles = []

  if (rawCat === 'carb' && carbInEbookLooksLikeLanche(name, n)) {
    return {
      recipe_category: 'lanche',
      meal_roles: [],
      tags: normalizeTagsArray(tags),
    }
  }

  const hasVegNoodle =
    /(cenoura|abobrinha|berinjela).*lasanh|lasanh.*(cenoura|abobrinha|berinjela|abobrinhas)/i.test(name)
  const vegLasanhaMain =
    /lasanh/.test(n) &&
    /(abobrinha|cenoura|berinjela|veg|legumes|milanesa)/.test(n) &&
    !/(carne|frango|bolon|m[ií]nimo|presunto|lingui|bacon)/.test(n)

  const meatyLasanha =
    /lasanh/.test(n) && !vegLasanhaMain && !hasVegNoodle && /(carne|frango|bolon|presunto|lingui|m[ií]nimo)/.test(n)

  const meatyPastaName =
    /bolonhesa|carbonara|macarr[aã]o.*(frango|carne|mo[ií]da|atum|bacalhau|salsicha)|talharim.*(frango|carne)|espaguete.*(frango|carne|mo[ií]da)|penne.*(frango|carne)|nhoque.*(carne|frango|bolon)|canelone.*(carne|frango)|rav[ií]oli.*(carne|frango)/i.test(
      name,
    )

  const carbSlotButLooksLikeFullDish =
    rawCat === 'carb' &&
    /(macarr|espaguete|penne|fusilli|fettuccine|talharim|nhoque|canelone|rav[ií]oli|lasanh)/i.test(n) &&
    /(frango|carne|mo[ií]da|atum|salsicha|bacalhau|presunto)/i.test(n)

  if (vegLasanhaMain || hasVegNoodle || (rawCat === 'carb' && /lasanh/i.test(n) && /(cenoura|abobrinha|berinjela)/i.test(n))) {
    recipe_category = 'legumes'
    meal_roles = []
  } else if (meatyLasanha || meatyPastaName || carbSlotButLooksLikeFullDish) {
    recipe_category = 'protein'
    meal_roles = ['carb']
  }

  return {
    recipe_category,
    meal_roles: [...new Set(meal_roles)].filter(Boolean),
    tags: normalizeTagsArray(tags),
  }
}

module.exports = { normalizeEbookRecipeForSeed }
