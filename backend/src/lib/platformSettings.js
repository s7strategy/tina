const { one, query } = require('./db')

function splitKeyList(raw) {
  if (raw == null || raw === '') return []
  return String(raw)
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function dedupeKeys(arr) {
  const out = []
  const seen = new Set()
  for (const k of arr) {
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(k)
  }
  return out
}

/** Prefixo típico da chave → provedor API (gsk_=Groq, AIza=Gemini, resto OpenAI). */
function inferProviderFromKeyPrefix(k0) {
  if (!k0) return 'openai'
  const s = String(k0)
  if (s.startsWith('gsk_')) return 'groq'
  if (s.startsWith('AIza')) return 'gemini'
  return 'openai'
}

function inferProviderFromKeys(keys) {
  return inferProviderFromKeyPrefix(keys && keys[0])
}

/**
 * Provedor LLM: LLM_PROVIDER no env > llm_provider na base > prefixo da primeira chave efectiva.
 */
async function resolveLlmProvider(executor) {
  const envP = process.env.LLM_PROVIDER?.trim().toLowerCase()
  if (envP === 'groq' || envP === 'openai' || envP === 'gemini') return envP

  const row = await one(`SELECT value FROM platform_settings WHERE key = $1`, ['llm_provider'], executor)
  const stored = row?.value?.trim().toLowerCase()
  if (stored === 'groq' || stored === 'openai' || stored === 'gemini') return stored

  const keys = await getLlmApiKeyList(executor)
  return inferProviderFromKeyPrefix(keys[0])
}

/** Só chaves gravadas na base (painel Super Admin). */
async function getLlmApiKeyListFromDb(executor) {
  const out = []
  const rowMulti = await one(`SELECT value FROM platform_settings WHERE key = $1`, ['llm_api_keys'], executor)
  if (rowMulti?.value) {
    try {
      const j = JSON.parse(rowMulti.value)
      if (Array.isArray(j)) {
        for (const x of j) {
          const t = String(x).trim()
          if (t) out.push(t)
        }
      }
    } catch {
      /* ignore */
    }
  }
  const rowSingle = await one(`SELECT value FROM platform_settings WHERE key = $1`, ['openai_api_key'], executor)
  if (rowSingle?.value?.trim()) out.push(rowSingle.value.trim())
  return dedupeKeys(out)
}

/**
 * Chaves LLM efectivas: funde env (tentadas primeiro) + base de dados (painel).
 * Assim várias chaves guardadas no painel são sempre usadas, mesmo com OPENAI_API_KEY no servidor.
 */
async function getLlmApiKeyList(executor) {
  const envMulti = process.env.LLM_API_KEYS || process.env.GROQ_API_KEYS
  const envSingle = process.env.OPENAI_API_KEY
  const fromEnv = dedupeKeys([...splitKeyList(envMulti), ...splitKeyList(envSingle)])
  const fromDb = await getLlmApiKeyListFromDb(executor)
  return dedupeKeys([...fromEnv, ...fromDb])
}

async function getLlmModel(executor) {
  const e = process.env.LLM_MODEL?.trim() || process.env.OPENAI_MODEL?.trim()
  if (e) return e
  const row = await one(`SELECT value FROM platform_settings WHERE key = $1`, ['openai_model'], executor)
  const fromDb = row?.value?.trim()
  if (fromDb) return fromDb
  return 'gpt-4o-mini'
}

function maskKeyHint(key) {
  const s = String(key)
  if (s.length <= 8) return '****'
  return `${s.slice(0, 4)}…${s.slice(-4)}`
}

/** Resposta segura para o painel (nunca expõe chaves completas). */
async function getPlatformIntegrationSummary(executor) {
  const envMulti = Boolean((process.env.LLM_API_KEYS || process.env.GROQ_API_KEYS || '').trim())
  const envSingle = Boolean(process.env.OPENAI_API_KEY?.trim())
  const fromEnvKeys = envMulti || envSingle
  const modelFromEnv = Boolean((process.env.LLM_MODEL || process.env.OPENAI_MODEL || '').trim())

  const rowMulti = await one(`SELECT value, updated_at FROM platform_settings WHERE key = $1`, ['llm_api_keys'], executor)
  const rowSingle = await one(`SELECT value, updated_at FROM platform_settings WHERE key = $1`, ['openai_api_key'], executor)
  const rowModel = await one(`SELECT value FROM platform_settings WHERE key = $1`, ['openai_model'], executor)
  const rowLlmProv = await one(`SELECT value FROM platform_settings WHERE key = $1`, ['llm_provider'], executor)

  let dbKeyCountBase = 0
  const dbHints = []
  if (rowMulti?.value) {
    try {
      const j = JSON.parse(rowMulti.value)
      if (Array.isArray(j)) {
        const arr = j.map((x) => String(x).trim()).filter(Boolean)
        dbKeyCountBase = arr.length
        for (const k of arr) dbHints.push(maskKeyHint(k))
      }
    } catch {
      /* */
    }
  }
  if (dbKeyCountBase === 0 && rowSingle?.value?.trim()) {
    dbKeyCountBase = 1
    dbHints.push(maskKeyHint(rowSingle.value))
  }

  const envKeyCount = fromEnvKeys
    ? dedupeKeys([
        ...splitKeyList(process.env.LLM_API_KEYS || process.env.GROQ_API_KEYS),
        ...splitKeyList(process.env.OPENAI_API_KEY),
      ]).length
    : 0

  const model =
    (process.env.LLM_MODEL || process.env.OPENAI_MODEL || '').trim() ||
    rowModel?.value?.trim() ||
    'gpt-4o-mini'

  const allKeysPreview = await getLlmApiKeyList(executor)
  const providerGuess = inferProviderFromKeys(allKeysPreview)
  let llmProviderEffective = providerGuess
  try {
    llmProviderEffective = await resolveLlmProvider(executor)
  } catch {
    /* */
  }
  const llmProviderStored = rowLlmProv?.value?.trim() || null

  const mergedEnvAndDb = fromEnvKeys && dbKeyCountBase > 0

  return {
    openAiConfigured: allKeysPreview.length > 0,
    llmConfigured: allKeysPreview.length > 0,
    llmKeyCount: allKeysPreview.length,
    llmKeyCountDb: dbKeyCountBase,
    llmKeyCountEnv: envKeyCount,
    llmKeysFromEnv: fromEnvKeys,
    llmKeysMergedEnvAndDb: mergedEnvAndDb,
    llmProviderGuess: providerGuess,
    llmProviderEffective,
    llmProviderStored,
    openAiKeyFromEnv: fromEnvKeys,
    openAiModel: model,
    openAiModelFromEnv: modelFromEnv,
    llmKeyHintsDb: dbHints,
    openAiKeyHint: dbHints[0] || null,
    openAiKeyUpdatedAt: rowMulti?.updated_at || rowSingle?.updated_at || null,
  }
}

async function updatePlatformIntegration(body, executor) {
  const {
    openAiApiKey,
    llmApiKeysText,
    clearOpenAiApiKey,
    clearLlmApiKeys,
    openAiModel,
    llmProvider,
  } = body || {}
  const now = new Date().toISOString()

  if (clearLlmApiKeys === true || clearOpenAiApiKey === true) {
    await query(`DELETE FROM platform_settings WHERE key = $1`, ['llm_api_keys'], executor)
    await query(`DELETE FROM platform_settings WHERE key = $1`, ['openai_api_key'], executor)
  }

  let keysToStore = []
  if (typeof llmApiKeysText === 'string' && llmApiKeysText.trim()) {
    keysToStore = dedupeKeys(splitKeyList(llmApiKeysText))
  } else if (typeof openAiApiKey === 'string' && openAiApiKey.trim()) {
    keysToStore = [openAiApiKey.trim()]
  }

  if (keysToStore.length > 0) {
    await query(
      `
      INSERT INTO platform_settings (key, value, updated_at)
      VALUES ('llm_api_keys', $1, $2)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `,
      [JSON.stringify(keysToStore), now],
      executor,
    )
    await query(`DELETE FROM platform_settings WHERE key = $1`, ['openai_api_key'], executor)
  }

  if (typeof openAiModel === 'string' && openAiModel.trim() && !process.env.LLM_MODEL?.trim() && !process.env.OPENAI_MODEL?.trim()) {
    const m = openAiModel.trim().slice(0, 80)
    await query(
      `
      INSERT INTO platform_settings (key, value, updated_at)
      VALUES ('openai_model', $1, $2)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `,
      [m, now],
      executor,
    )
  }

  const pv = typeof llmProvider === 'string' ? llmProvider.trim().toLowerCase() : ''
  if (pv === 'groq' || pv === 'openai' || pv === 'gemini') {
    if (!process.env.LLM_PROVIDER?.trim()) {
      await query(
        `
        INSERT INTO platform_settings (key, value, updated_at)
        VALUES ('llm_provider', $1, $2)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
      `,
        [pv, now],
        executor,
      )
    }
  }
}

/** @deprecated usar getLlmApiKeyList — mantido para chamadas antigas */
async function getOpenAiApiKey(executor) {
  const list = await getLlmApiKeyList(executor)
  return list[0] || null
}

/** @deprecated usar getLlmModel */
async function getOpenAiModel(executor) {
  return getLlmModel(executor)
}

module.exports = {
  getLlmApiKeyList,
  getLlmApiKeyListFromDb,
  getLlmModel,
  getOpenAiApiKey,
  getOpenAiModel,
  getPlatformIntegrationSummary,
  updatePlatformIntegration,
  inferProviderFromKeys,
  inferProviderFromKeyPrefix,
  resolveLlmProvider,
  maskKeyHint,
}
