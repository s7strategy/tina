/**
 * Refinamento opcional dos 30 pratos via LLM (OpenAI ou Groq).
 * Várias chaves: tenta a seguinte em 401/403/429 ou pistas de rate limit no corpo.
 *
 * --- Alinhamento com documentação de “treino” externa ---
 * O modelo NÃO recebe campos tipo_refeicao nem tem_proteina na BD. Na app usamos:
 *   mealCategory (carb, leguminosas, protein, legumes, salada, bebida, lanche, …),
 *   mealRoles / meal_combo_rules no backend antes disto, e nomes de receita no JSON.
 * O LLM deve inferir “proteína embutida” e horário adequado pelo nome + contexto do cardápio.
 * Ele só pode trocar recipeId dentro do mesmo slot (mesma mealCategory); não adiciona/remove slots.
 */

const { inferProviderFromKeys } = require('./platformSettings')

const MEAL_KIND_LABEL = {
  almoco: 'Almoço',
  jantar: 'Jantar',
  cafe_manha: 'Café da manhã',
  lanche: 'Lanche',
}

/** Prompt de sistema: combinações BR + restrições técnicas da API (treino operacional Tina). */
const MEALS_AUTO_LLM_SYSTEM = `És um assistente de refeições para famílias no Brasil.

FORMATO DE RESPOSTA (obrigatório)
Responde APENAS com JSON válido, uma única raiz:
{"variations":[{"index":number,"label":string,"slots":[{"mealCategory":string,"recipeId":string,"recipeName":string}]}]}
Não inventes recipeId. Cada recipeId tem de existir em alternativasPorCategoria para essa mealCategory.

PAPEL NESTA API
Recebes pratos já montados (slots fixos por categorias). Só podes SUBSTITUIR recipeId dentro de cada slot, mantendo a mesma mealCategory, o mesmo número de slots e os mesmos índices 1..N. Não cries pratos nem ingredientes.

DADOS DAS RECEITAS
Cada receita tem nome e mealCategory (ex.: carb, leguminosas, protein, legumes, salada, bebida, lanche). Não há campos separados "tipo_refeicao" ou "tem_proteina": usa o nome e a categoria para inferir se já há proteína no prato (ex. bolonhesa, strogonoff, macarrão com frango).

OBJETIVO
Combinações realistas, equilibradas, comuns no dia a dia brasileiro; sensação de refeição que uma pessoa comeria.

TIPO DE CARDÁPIO (vém no JSON do utilizador em contexto.tipoCardapio)
- Almoço/Jantar: costuma incluir carboidrato, leguminosa (às vezes omitida pelo sistema), proteína, legumes, salada — respeita o que já vier nos slots.
- Café da manhã: lanche leve / proteína leve + bebida conforme slots.
- Lanche: itens de lanche + bebida conforme slots.

COMPATIBILIDADE (obrigatório)
Evita pares culturalmente estranhos ou redundantes:
- Evita strogonoff (ou molho cremoso semelhante) com feijão/lentilha no MESMO prato quando ambos aparecem em slots separados.
- Evita macarrão + feijão no mesmo prato completo (dupla de carb pesado).
- Não uses receitas claramente de lanche/crepioca como peça central de almoço/jantar se o nome indicar isso e houver alternativa melhor na lista.
- Evita duas proteínas principais: se o nome já indica proteína na massa/prato único (bolonhesa, strogonoff, frango ao molho com massa), não escolhas OUTRA proteína “principal” óbvia noutro slot (ex. filé de frango extra). Queijo/bacon podem ser complemento leve, não segunda carne.
- Evita dois carboidratos pesados explícitos (ex. arroz + massa) no mesmo prato se ambos estiverem como opções em slots carb — prefere um.
- Salada não substitui refeição principal; mantém proteína/carb adequados conforme slots.

VARIAÇÃO
Alterna proteínas e preparos entre os 30 pratos quando possível; arroz/feijão podem repetir mais. Não fiques sempre em frango.

REGRA DE OURO
Se a combinação parecer estranha no Brasil, troca por IDs alternativos válidos na mesma categoria.

VALIDAÇÃO MENTAL
Antes de devolver o JSON: faz sentido no dia a dia? Uma proteína principal? Excesso de carb? Conflito cultural óbvio? Se não, ajusta só com IDs permitidos.

INTEGRAÇÃO TÉCNICA (Tina)
- O motor já definiu os slots de cada prato; só podes substituir recipeId dentro de cada mealCategory usando IDs presentes em alternativasPorCategoria.
- Na base de dados não existem campos tipo_refeicao nem tem_proteina: usa nome da receita, mealCategory e contexto.tipoCardapio.
- Café da manhã e lanche seguem o cardápio (ex.: bebida + lanche). Não inventes categorias nem apagues slots.`

const MAX_ALT_PER_CAT = 24

/** Compara escolhas de receita (ignora label). */
function variationsRecipeFingerprint(vars) {
  return JSON.stringify(
    (vars || []).map((v) => ({
      i: Number(v.index),
      slots: (v.slots || []).map((s) => `${String(s.mealCategory)}:${String(s.recipeId)}`),
    })),
  )
}

function buildAlternativesByCategory(pools, variations) {
  const result = {}
  function add(cat, id, name) {
    if (!cat || !id) return
    if (!result[cat]) result[cat] = []
    if (result[cat].some((x) => x.id === id)) return
    result[cat].push({ id, name: String(name || 'Receita').slice(0, 120) })
  }
  for (const [cat, entries] of Object.entries(pools || {})) {
    for (const e of entries || []) {
      if (e.userRecipeId) add(cat, e.userRecipeId, e.name)
    }
  }
  for (const v of variations || []) {
    for (const s of v.slots || []) {
      add(s.mealCategory, s.recipeId, s.recipeName)
    }
  }
  for (const cat of Object.keys(result)) {
    if (result[cat].length > MAX_ALT_PER_CAT) {
      result[cat] = result[cat].slice(0, MAX_ALT_PER_CAT)
    }
  }
  return result
}

function mergeRefined(original, aiParsed, altByCat) {
  if (!aiParsed?.variations || !Array.isArray(aiParsed.variations)) return null
  const byIndex = new Map(aiParsed.variations.map((v) => [Number(v.index), v]))
  const allowed = {}
  for (const cat of Object.keys(altByCat || {})) {
    allowed[cat] = new Set((altByCat[cat] || []).map((x) => x.id))
  }
  const out = []
  for (const orig of original) {
    const ai = byIndex.get(Number(orig.index))
    const slots = []
    for (const s of orig.slots || []) {
      const cand = ai?.slots?.find((x) => x.mealCategory === s.mealCategory)
      const pid = cand?.recipeId ? String(cand.recipeId) : ''
      if (pid && allowed[s.mealCategory]?.has(pid)) {
        const meta = (altByCat[s.mealCategory] || []).find((x) => x.id === pid)
        slots.push({
          mealCategory: s.mealCategory,
          recipeId: pid,
          recipeName: meta?.name || cand?.recipeName || s.recipeName,
        })
      } else {
        slots.push({ ...s })
      }
    }
    out.push({ index: orig.index, label: orig.label || `Prato ${orig.index}`, slots })
  }
  return out.length === original.length ? out : null
}

function normalizeModelForProvider(model, provider) {
  const m = (model || '').trim()
  if (provider === 'groq') {
    if (!m || /^groq$/i.test(m) || /gpt-4|gpt-3\.5|^o1|o3|davinci/i.test(m)) return 'llama-3.1-8b-instant'
    return m
  }
  if (!m || /^llama-|mixtral|gemma/i.test(m)) return 'gpt-4o-mini'
  return m
}

function chatUrlForProvider(provider) {
  return provider === 'groq'
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions'
}

async function fetchChatJson({ apiKey, url, model, userPayload, system, useJsonObjectFormat }) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 55000)
  try {
    const body = {
      model,
      temperature: 0.35,
      max_tokens: 8000,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
    }
    if (useJsonObjectFormat) body.response_format = { type: 'json_object' }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const raw = await res.text()
    if (!res.ok) {
      const err = new Error(raw.slice(0, 300))
      err.status = res.status
      err.bodyPreview = raw
      throw err
    }
    const data = JSON.parse(raw)
    const content = data?.choices?.[0]?.message?.content
    if (!content || typeof content !== 'string') return null
    try {
      return JSON.parse(content)
    } catch {
      return null
    }
  } finally {
    clearTimeout(t)
  }
}

async function tryRefineWithOneKey({ apiKey, url, model, variations, alternativesByCategory, userPayload, system }) {
  for (const useJson of [true, false]) {
    try {
      const parsed = await fetchChatJson({
        apiKey,
        url,
        model,
        userPayload,
        system,
        useJsonObjectFormat: useJson,
      })
      if (!parsed) continue
      const merged = mergeRefined(variations, parsed, alternativesByCategory)
      if (merged) return merged
    } catch (e) {
      if (!useJson) throw e
    }
  }
  return null
}

async function refineAutoVariationsWithLlm({
  apiKeys,
  model,
  variations,
  alternativesByCategory,
  mealKind = null,
  menuName = '',
}) {
  if (!apiKeys?.length || !variations?.length) return null

  const provider = inferProviderFromKeys(apiKeys)
  const url = chatUrlForProvider(provider)
  const useModel = normalizeModelForProvider(model, provider)

  const tipo =
    (mealKind && MEAL_KIND_LABEL[String(mealKind)]) || 'não especificado (inferir pelos slots e nomes)'

  const userPayload = {
    contexto: {
      tipoCardapio: tipo,
      nomeCardapio: menuName ? String(menuName).slice(0, 120) : '',
      nota:
        'O gerador base já pode ter omitido leguminosas em alguns pratos (ex. molho cremoso). Não reintroduzas slots.',
    },
    instrucoes:
      'Refina cada prato seguindo o sistema. Troca só recipeId dentro da mesma mealCategory; IDs apenas de alternativasPorCategoria[categoria]. Mantém índices, labels coerentes e o mesmo conjunto de mealCategories por prato.',
    pratos: variations.map((v) => ({
      index: v.index,
      slots: (v.slots || []).map((s) => ({
        mealCategory: s.mealCategory,
        recipeId: s.recipeId,
        recipeName: s.recipeName,
      })),
    })),
    alternativasPorCategoria: alternativesByCategory,
  }

  const system = MEALS_AUTO_LLM_SYSTEM

  const fpIn = variationsRecipeFingerprint(variations)

  for (let i = 0; i < apiKeys.length; i++) {
    const apiKey = apiKeys[i]
    try {
      let merged = await tryRefineWithOneKey({
        apiKey,
        url,
        model: useModel,
        variations,
        alternativesByCategory,
        userPayload,
        system,
      })
      if (merged && variationsRecipeFingerprint(merged) === fpIn) {
        const userPayloadRetry = {
          ...userPayload,
          segundaPassagem:
            'O teu resultado aceite pelo validador foi IGUAL ao de entrada (nenhuma receita mudou). Gera de novo o mesmo JSON de saída mas com várias trocas reais de recipeId (orientação: pelo menos 6 a 20 pratos com pelo menos um slot diferente), para melhorar harmonia no Brasil e variedade entre dias. Não devolvas o mesmo conjunto de IDs; só uses IDs listados em alternativasPorCategoria.',
        }
        const merged2 = await tryRefineWithOneKey({
          apiKey,
          url,
          model: useModel,
          variations,
          alternativesByCategory,
          userPayload: userPayloadRetry,
          system,
        })
        if (merged2 && variationsRecipeFingerprint(merged2) !== fpIn) merged = merged2
      }
      if (merged) return merged
    } catch (e) {
      const status = e.status || 0
      const preview = String(e.bodyPreview || e.message || '')
      console.warn(`[mealsAutoVariationAi] chave ${i + 1}/${apiKeys.length}:`, status, preview.slice(0, 100))
    }
  }
  return null
}

async function refineAutoVariationsWithOpenAI(opts) {
  const k = opts.apiKey
  if (!k) return null
  return refineAutoVariationsWithLlm({
    apiKeys: [k],
    model: opts.model,
    variations: opts.variations,
    alternativesByCategory: opts.alternativesByCategory,
  })
}

module.exports = {
  buildAlternativesByCategory,
  refineAutoVariationsWithLlm,
  refineAutoVariationsWithOpenAI,
  mergeRefined,
}
