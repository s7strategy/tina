import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../lib/api.js'
import { LOGO_SRC } from '../lib/branding.js'
import ErrorBoundary from '../components/ui/ErrorBoundary.jsx'
import {
  LLM_PROVIDERS,
  LLM_MODELS_BY_PROVIDER,
  defaultModelForProvider,
} from '../lib/adminLlmPresets.js'

function newKeyRow() {
  return { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, value: '' }
}

export default function SuperAdminIntegrationsPage() {
  const { token, logout } = useAuth()
  const [platform, setPlatform] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [llmProvider, setLlmProvider] = useState('groq')
  const [modelChoice, setModelChoice] = useState('__preset__')
  const [modelPreset, setModelPreset] = useState(defaultModelForProvider('groq'))
  const [modelCustom, setModelCustom] = useState('')
  const [keyRows, setKeyRows] = useState(() => Array.from({ length: 5 }, () => newKeyRow()))

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const p = await api.getAdminPlatform(token)
      setPlatform(p)
      const fromDb = p.llmProviderStored && LLM_PROVIDERS.some((x) => x.id === p.llmProviderStored)
      const fromEff = p.llmProviderEffective && LLM_PROVIDERS.some((x) => x.id === p.llmProviderEffective)
      const prov =
        (fromDb ? p.llmProviderStored : null) ||
        (fromEff ? p.llmProviderEffective : null) ||
        (p.llmProviderGuess === 'groq' ? 'groq' : p.llmProviderGuess === 'gemini' ? 'gemini' : 'openai')
      setLlmProvider(prov)
      const m = p.openAiModel || defaultModelForProvider(prov)
      const presets = LLM_MODELS_BY_PROVIDER[prov] || []
      const found = presets.some((x) => x.id === m)
      if (found) {
        setModelChoice('__preset__')
        setModelPreset(m)
        setModelCustom('')
      } else {
        setModelChoice('__custom__')
        setModelPreset(presets[0]?.id || defaultModelForProvider(prov))
        setModelCustom(m)
      }
    } catch (e) {
      setFeedback({ type: 'error', message: e.message || 'Erro ao carregar.' })
      setPlatform(null)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const models = LLM_MODELS_BY_PROVIDER[llmProvider] || LLM_MODELS_BY_PROVIDER.openai

  function addKeyRow() {
    setKeyRows((r) => [...r, newKeyRow()])
  }

  function removeKeyRow(id) {
    setKeyRows((r) => (r.length <= 1 ? r : r.filter((x) => x.id !== id)))
  }

  function setRowValue(id, value) {
    setKeyRows((r) => r.map((x) => (x.id === id ? { ...x, value } : x)))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFeedback(null)
    setSaving(true)
    try {
      const joined = keyRows.map((r) => r.value.trim()).filter(Boolean).join('\n')
      const modelFinal =
        modelChoice === '__custom__' && modelCustom.trim()
          ? modelCustom.trim()
          : modelPreset
      const body = {
        llmProvider,
        openAiModel: modelFinal,
      }
      if (joined.length > 0) {
        body.llmApiKeysText = joined
      }
      const next = await api.patchAdminPlatform(token, body)
      setPlatform(next)
      setKeyRows(Array.from({ length: Math.max(5, keyRows.length) }, () => newKeyRow()))
      setFeedback({
        type: 'success',
        message: joined.length
          ? 'Guardado. Chaves novas estão na base (por segurança os campos foram limpos).'
          : 'Provedor/modelo guardados. As chaves já na base mantêm-se.',
      })
    } catch (err) {
      setFeedback({ type: 'error', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    if (!window.confirm('Remover todas as chaves LLM guardadas na base? (o env do servidor mantém-se)')) return
    setSaving(true)
    try {
      const next = await api.patchAdminPlatform(token, { clearLlmApiKeys: true })
      setPlatform(next)
      setFeedback({ type: 'success', message: 'Chaves removidas da base.' })
    } catch (e) {
      setFeedback({ type: 'error', message: e.message })
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    const def = defaultModelForProvider(llmProvider)
    setModelPreset((prev) => {
      const list = LLM_MODELS_BY_PROVIDER[llmProvider] || []
      if (list.some((x) => x.id === prev)) return prev
      return def
    })
  }, [llmProvider])

  const p = platform

  return (
    <ErrorBoundary>
      <div className="page-wrap admin-page admin-integrations-page">
        <div className="admin-integrations-hero">
          <div className="admin-brand" style={{ alignItems: 'center', gap: 12 }}>
            <img src={LOGO_SRC} alt="" width={120} height={28} decoding="async" />
            <div>
              <div className="admin-section-label">Super Admin</div>
              <strong>API &amp; IA</strong>
              <p className="admin-subtitle" style={{ margin: '6px 0 0', maxWidth: 720 }}>
                Chaves usadas em variações de pratos, lista de compras e outras funções LLM. Chaves definidas no servidor
                (env) somam-se às que guardas aqui.
              </p>
            </div>
          </div>
          <div className="admin-toolbar admin-integrations-toolbar">
            <Link className="admin-button admin-button-ghost" to="/super-admin">
              ← Voltar aos clientes
            </Link>
            <Link className="admin-button admin-button-ghost" to="/app">
              Dashboard Tina
            </Link>
            <button type="button" className="admin-button admin-button-ghost" onClick={() => logout()}>
              Sair
            </button>
          </div>
        </div>

        {feedback ? <div className={`feedback ${feedback.type === 'success' ? 'success' : 'error'}`}>{feedback.message}</div> : null}

        {loading ? (
          <p className="admin-subtitle">A carregar…</p>
        ) : (
          <div className="admin-card admin-integrations-card">
            {p?.llmKeysFromEnv ? (
              <p className="feedback success" style={{ marginBottom: 16 }}>
                O servidor tem <strong>chaves no env</strong> — são tentadas primeiro. As que guardares aqui na base entram
                em seguida na mesma rotação.
              </p>
            ) : null}

            {p?.llmKeysMergedEnvAndDb ? (
              <p style={{ fontSize: '0.9em', color: 'var(--t2)', marginBottom: 12 }}>
                <strong>Env + base:</strong> {p.llmKeyCount ?? 0} chave(s) no total.
              </p>
            ) : null}

            {p?.llmConfigured ? (
              <div className="admin-integrations-status">
                <span className="admin-integ-badge ok">LLM activo</span>
                <span>
                  {p.llmKeyCount ?? 0} chave(s). Provedor efectivo:{' '}
                  <strong>{p.llmProviderEffective || p.llmProviderGuess || '—'}</strong>
                  {p.openAiModel ? (
                    <>
                      {' '}
                      · modelo: <code>{p.openAiModel}</code>
                    </>
                  ) : null}
                </span>
              </div>
            ) : (
              <div className="admin-integrations-status">
                <span className="admin-integ-badge warn">Sem chaves detectadas</span>
                <span>Adiciona chaves abaixo e guarda (ou configura o env do servidor).</span>
              </div>
            )}

            {Array.isArray(p?.llmKeyHintsDb) && p.llmKeyHintsDb.length > 0 ? (
              <div className="admin-llm-saved-block">
                <div className="admin-section-label" style={{ marginBottom: 8 }}>
                  Chaves guardadas na base — pré-visualização ({p.llmKeyCountDb ?? p.llmKeyHintsDb.length})
                </div>
                <div className="admin-llm-hint-chips">
                  {p.llmKeyHintsDb.map((h) => (
                    <span key={h} className="admin-llm-chip">
                      {h}
                    </span>
                  ))}
                </div>
                <p className="admin-integ-hint" style={{ marginTop: 8 }}>
                  Para substituir toda a lista, preenche novas chaves nas caixas e guarda.
                </p>
              </div>
            ) : null}

            <form className="admin-integrations-form" onSubmit={handleSubmit}>
              <div className="admin-integ-field">
                <label className="admin-section-label" htmlFor="integ-provider">
                  Provedor
                </label>
                <select
                  id="integ-provider"
                  className="admin-select admin-integ-select"
                  value={llmProvider}
                  onChange={(e) => setLlmProvider(e.target.value)}
                  disabled={saving}
                >
                  {LLM_PROVIDERS.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.label}
                    </option>
                  ))}
                </select>
                <p className="admin-integ-hint">{LLM_PROVIDERS.find((x) => x.id === llmProvider)?.note}</p>
              </div>

              <div className="admin-integ-field">
                <label className="admin-section-label" htmlFor="integ-model-mode">
                  Modelo
                </label>
                <select
                  id="integ-model-mode"
                  className="admin-select admin-integ-select"
                  value={modelChoice}
                  onChange={(e) => setModelChoice(e.target.value)}
                  disabled={saving || p?.openAiModelFromEnv}
                >
                  <option value="__preset__">Escolher modelo comum</option>
                  <option value="__custom__">Outro (ID exacto da API)</option>
                </select>
                {modelChoice === '__preset__' ? (
                  <select
                    className="admin-select admin-integ-select"
                    style={{ marginTop: 8 }}
                    value={modelPreset}
                    onChange={(e) => setModelPreset(e.target.value)}
                    disabled={saving || p?.openAiModelFromEnv}
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="admin-input"
                    style={{ marginTop: 8 }}
                    value={modelCustom}
                    onChange={(e) => setModelCustom(e.target.value)}
                    placeholder="ex.: llama-3.1-8b-instant ou gemini-2.0-flash"
                    disabled={saving || p?.openAiModelFromEnv}
                  />
                )}
                {p?.openAiModelFromEnv ? (
                  <p className="admin-integ-hint">Modelo definido no servidor (LLM_MODEL / OPENAI_MODEL).</p>
                ) : null}
              </div>

              <div className="admin-integ-field">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <label className="admin-section-label" style={{ margin: 0 }}>
                    Novas chaves (uma por linha)
                  </label>
                  <button type="button" className="admin-button admin-button-ghost admin-button-tiny" onClick={addKeyRow} disabled={saving}>
                    + Adicionar caixa
                  </button>
                </div>
                <div className="admin-llm-key-rows">
                  {keyRows.map((row, idx) => (
                    <div key={row.id} className="admin-llm-key-row">
                      <span className="admin-llm-key-num">{idx + 1}</span>
                      <input
                        type="password"
                        autoComplete="off"
                        className="admin-input admin-llm-key-input"
                        placeholder={`${LLM_PROVIDERS.find((x) => x.id === llmProvider)?.prefix ?? ''}…`}
                        value={row.value}
                        onChange={(e) => setRowValue(row.id, e.target.value)}
                        disabled={saving}
                      />
                      {keyRows.length > 1 ? (
                        <button
                          type="button"
                          className="admin-button admin-button-ghost admin-button-tiny"
                          onClick={() => removeKeyRow(row.id)}
                          disabled={saving}
                          aria-label="Remover"
                        >
                          ✕
                        </button>
                      ) : (
                        <span className="admin-llm-key-spacer" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="admin-integ-actions">
                <button type="submit" className="admin-button" disabled={saving}>
                  {saving ? 'A guardar…' : 'Guardar'}
                </button>
                {(p?.llmKeyCountDb ?? 0) > 0 ? (
                  <button type="button" className="admin-button admin-button-ghost" disabled={saving} onClick={handleClear}>
                    Limpar chaves da base
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        )}
      </div>
    </ErrorBoundary>
  )
}
