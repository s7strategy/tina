/**
 * Chamadas LLM unificadas: OpenAI, Groq (OpenAI-compatible) e Google Gemini.
 * Provedor efectivo: resolveLlmProvider (env LLM_PROVIDER > platform_settings llm_provider > prefixo da chave).
 */

const { resolveLlmProvider } = require('./platformSettings')

function normalizeLlmModel(model, provider) {
  const m = String(model || '').trim()
  if (provider === 'groq') {
    if (!m || /^groq$/i.test(m) || /gpt-4|gpt-3\.5|^o1|o3|davinci/i.test(m)) return 'llama-3.1-8b-instant'
    return m
  }
  if (provider === 'gemini') {
    if (!m || /^gemini$/i.test(m) || /^gpt|^llama|^o1|sk-/i.test(m)) return 'gemini-2.0-flash'
    return m.replace(/^models\//, '')
  }
  if (!m || /^llama-|mixtral|gemma/i.test(m)) return 'gpt-4o-mini'
  return m
}

function openAiCompatibleUrl(provider) {
  return provider === 'groq'
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions'
}

async function fetchOpenAiCompatibleJson({
  apiKey,
  url,
  model,
  system,
  userPayload,
  useJsonObjectFormat,
  timeoutMs = 55000,
  temperature = 0.35,
  maxTokens = 8000,
}) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const body = {
      model,
      temperature,
      max_tokens: maxTokens,
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
      const err = new Error(raw.slice(0, 400))
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

async function fetchGeminiJson({
  apiKey,
  model,
  system,
  userText,
  useJson,
  timeoutMs = 55000,
  temperature = 0.35,
  maxOutputTokens = 8192,
}) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const mid = String(model || '').replace(/^models\//, '')
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(mid)}:generateContent?key=${encodeURIComponent(apiKey)}`
    const generationConfig = {
      temperature,
      maxOutputTokens,
    }
    if (useJson) generationConfig.responseMimeType = 'application/json'

    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig,
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const raw = await res.text()
    if (!res.ok) {
      const err = new Error(raw.slice(0, 400))
      err.status = res.status
      throw err
    }
    const data = JSON.parse(raw)
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text || typeof text !== 'string') return null
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  } finally {
    clearTimeout(t)
  }
}

/**
 * Resposta JSON de um único pedido (rotação de chaves fica no chamador).
 */
async function llmJsonCompletion({
  executor,
  apiKey,
  model,
  system,
  userPayload,
  useJsonObjectFormat = true,
  temperature,
  maxTokens,
  timeoutMs,
}) {
  const provider = await resolveLlmProvider(executor)
  const useModel = normalizeLlmModel(model, provider)
  const payloadObj =
    typeof userPayload === 'object' && userPayload !== null ? userPayload : JSON.parse(String(userPayload))
  const userText = JSON.stringify(payloadObj)

  if (provider === 'gemini') {
    return fetchGeminiJson({
      apiKey,
      model: useModel,
      system,
      userText,
      useJson: useJsonObjectFormat,
      timeoutMs: timeoutMs ?? 55000,
      temperature: temperature ?? 0.35,
      maxOutputTokens: maxTokens ?? 8192,
    })
  }

  const url = openAiCompatibleUrl(provider)
  return fetchOpenAiCompatibleJson({
    apiKey,
    url,
    model: useModel,
    system,
    userPayload: payloadObj,
    useJsonObjectFormat,
    timeoutMs: timeoutMs ?? 55000,
    temperature: temperature ?? 0.35,
    maxTokens: maxTokens ?? 8000,
  })
}

module.exports = {
  normalizeLlmModel,
  llmJsonCompletion,
  fetchOpenAiCompatibleJson,
  fetchGeminiJson,
  openAiCompatibleUrl,
}
