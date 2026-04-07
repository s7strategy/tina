/**
 * Opcional: normaliza nomes de ingredientes para fusão na lista de compras via LLM (mesmas chaves da plataforma).
 * Desativar: SHOPPING_INGREDIENT_AI=0 ou false no env.
 */

const { getLlmApiKeyList, getLlmModel } = require('./platformSettings')
const { llmJsonCompletion } = require('./llmClient')

const SHOPPING_LLM_SYSTEM = `És um assistente para lista de compras de supermercado no Brasil.

Tarefa: para cada string no array "ingredientes" (como aparece numa receita em português), indica o produto BASE que a pessoa compra na loja.

REGRAS
- Remove quantidades, unidades entre parênteses se forem só medida, modos de preparo e cortes: picadinho, em cubos, rodelas, fatias finas, grelhado, refogado, cozido, lavado, temperado, etc.
- Remove estado que não muda o produto na gôndola (ex.: "fresco", "bem maduro") salvo quando faz parte do nome usual vendido.
- MANTÉM qualificadores que distinguem produtos diferentes: "óleo de soja", "farinha de trigo", "leite integral", "linguiça calabresa", "fermento biológico".
- Não inventes marcas. Resposta curta: substantivo(s) essencial(is).

FORMATO (obrigatório)
Responde APENAS com JSON válido:
{"items":[{"in":string,"base":string}]}

O campo "in" deve ser EXACTAMENTE igual a uma das strings recebidas em "ingredientes" (mesmo texto, mesmo acento).`

/** Cache em memória por processo: chave normalizada (sem acento, lower) → chave de fusão final. */
const mergeKeyCache = new Map()
const MAX_CHUNK = 44

async function tryResolveChunkWithKey({ executor, apiKey, model, ingredientes, normalizeIngredientName }) {
  const parsedArrays = []
  for (const useJson of [true, false]) {
    try {
      const parsed = await llmJsonCompletion({
        executor,
        apiKey,
        model,
        system: SHOPPING_LLM_SYSTEM,
        userPayload: { ingredientes },
        useJsonObjectFormat: useJson,
        temperature: 0.12,
        maxTokens: 4500,
        timeoutMs: 32000,
      })
      if (parsed?.items && Array.isArray(parsed.items)) {
        parsedArrays.push(parsed.items)
        break
      }
    } catch (e) {
      if (!useJson) throw e
    }
  }
  if (!parsedArrays.length) return null

  const byNorm = new Map()
  for (const item of parsedArrays[0]) {
    if (!item || typeof item.base !== 'string') continue
    const inn = String(item.in || '').trim()
    const base = String(item.base || '').trim()
    if (!inn || !base) continue
    const n = normalizeIngredientName(inn)
    if (n) byNorm.set(n, base)
  }
  return byNorm
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * @param {string[]} rawNames
 * @param {*} executor pool PG (opcional)
 * @returns {Promise<Map<string,string>>} mapa normalizeIngredientName(raw) → mergeKey
 */
async function resolveShoppingIngredientMergeKeys(rawNames, executor = undefined) {
  const {
    ingredientMergeKey,
    mergeKeyFromSuggestedProductLabel,
    normalizeIngredientName,
  } = require('./mealsShoppingGenerate')

  const normToRaw = new Map()
  for (const raw of rawNames) {
    const t = String(raw || '').trim()
    if (!t) continue
    const n = normalizeIngredientName(t)
    if (!n) continue
    if (!normToRaw.has(n)) normToRaw.set(n, t)
  }
  const uniqueNorms = [...normToRaw.keys()]

  const out = new Map()
  for (const n of uniqueNorms) {
    out.set(n, mergeKeyCache.get(n) || ingredientMergeKey(normToRaw.get(n)))
  }

  const disabled =
    process.env.SHOPPING_INGREDIENT_AI === '0' || String(process.env.SHOPPING_INGREDIENT_AI).toLowerCase() === 'false'
  if (disabled) {
    return out
  }

  const apiKeys = await getLlmApiKeyList(executor)
  if (!apiKeys.length) {
    return out
  }

  const toRequest = uniqueNorms.filter((n) => !mergeKeyCache.has(n))
  if (!toRequest.length) {
    return out
  }

  const modelRaw = await getLlmModel(executor)

  for (const partNorms of chunk(toRequest, MAX_CHUNK)) {
    const ingredientes = partNorms.map((n) => normToRaw.get(n))
    let byNormBase = null
    for (let ki = 0; ki < apiKeys.length; ki++) {
      try {
        byNormBase = await tryResolveChunkWithKey({
          executor,
          apiKey: apiKeys[ki],
          model: modelRaw,
          ingredientes,
          normalizeIngredientName,
        })
        if (byNormBase && byNormBase.size > 0) break
      } catch (e) {
        const st = e.status || 0
        console.warn(
          `[shopping LLM] chave ${ki + 1}/${apiKeys.length}:`,
          st,
          String(e.message || e).slice(0, 160),
        )
      }
    }
    if (!byNormBase || byNormBase.size === 0) continue

    for (const n of partNorms) {
      const base = byNormBase.get(n)
      if (!base) continue
      const mk = mergeKeyFromSuggestedProductLabel(base)
      if (mk) {
        mergeKeyCache.set(n, mk)
        out.set(n, mk)
      }
    }
  }

  return out
}

module.exports = {
  resolveShoppingIngredientMergeKeys,
}
