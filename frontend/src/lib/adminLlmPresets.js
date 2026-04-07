/** Provedores e modelos comuns para o painel Super Admin (labels amigáveis). */

export const LLM_PROVIDERS = [
  { id: 'groq', label: 'Groq (API estilo OpenAI, Llama)', prefix: 'gsk_', note: 'Chaves começam com gsk_' },
  { id: 'openai', label: 'OpenAI (GPT)', prefix: 'sk-', note: 'Chaves começam com sk- ou sk_proj' },
  { id: 'gemini', label: 'Google Gemini', prefix: 'AIza', note: 'Chave API do Google AI Studio (AIza…)' },
]

export const LLM_MODELS_BY_PROVIDER = {
  groq: [
    { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant (rápido)' },
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile' },
    { id: 'llama3-70b-8192', label: 'Llama 3 70B' },
    { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
  ],
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o mini (económico)' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { id: 'o3-mini', label: 'o3-mini' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (recomendado)' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  ],
}

export function defaultModelForProvider(provider) {
  const list = LLM_MODELS_BY_PROVIDER[provider]
  return list?.[0]?.id ?? 'gpt-4o-mini'
}
