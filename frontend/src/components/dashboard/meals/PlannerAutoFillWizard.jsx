import { useEffect, useMemo, useState } from 'react'
import { api } from '../../../lib/api.js'

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

function ymdToMonthStr(y, m0) {
  return `${y}-${String(m0 + 1).padStart(2, '0')}`
}

function monthDayBounds(y, m0) {
  const last = new Date(y, m0 + 1, 0).getDate()
  const pad = (n) => String(n).padStart(2, '0')
  const ym = `${y}-${pad(m0 + 1)}`
  return { periodStart: `${ym}-01`, periodEnd: `${ym}-${pad(last)}` }
}

function yearOptions(centerY) {
  const y = Number(centerY) || new Date().getFullYear()
  const lo = Math.min(y - 2, 2024)
  const hi = Math.max(y + 4, 2030)
  const out = []
  for (let i = lo; i <= hi; i += 1) out.push(i)
  if (!out.includes(y)) {
    out.push(y)
    out.sort((a, b) => a - b)
  }
  return out
}

/**
 * Passo após escolher modo automático: porções opcionais, lista de compras opcional, cardápios e mês.
 */
export default function PlannerAutoFillWizard({
  token,
  members = [],
  menus,
  plannerMonth,
  onMonthYMChange,
  onBack,
  onDone,
}) {
  const [selected, setSelected] = useState([])
  useEffect(() => {
    setSelected((prev) => {
      const valid = prev.filter((id) => menus.some((m) => m.id === id))
      if (valid.length > 0) return valid
      return menus.map((m) => m.id)
    })
  }, [menus])

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  /** Se false, não grava colheres na conta (usa só porções por receita na lista de compras). */
  const [saveFamilyPortions, setSaveFamilyPortions] = useState(true)
  const [portionInputs, setPortionInputs] = useState({})

  const [syncShopping, setSyncShopping] = useState(false)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await api.getFamilyPortions(token)
        if (cancelled) return
        const spoons = r.memberSpoons && typeof r.memberSpoons === 'object' ? r.memberSpoons : {}
        const next = {}
        for (const m of members) {
          const n = Number(spoons[m.id])
          next[m.id] = Number.isFinite(n) && n > 0 ? String(n) : '4'
        }
        setPortionInputs(next)
      } catch {
        if (!cancelled) {
          const next = {}
          for (const m of members) {
            next[m.id] = '4'
          }
          setPortionInputs(next)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, members])

  const monthStr = useMemo(() => ymdToMonthStr(plannerMonth.y, plannerMonth.m), [plannerMonth])
  const monthRange = useMemo(
    () => monthDayBounds(plannerMonth.y, plannerMonth.m),
    [plannerMonth.y, plannerMonth.m],
  )

  function toggleMenu(id) {
    setSelected((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev
        return prev.filter((x) => x !== id)
      }
      return [...prev, id]
    })
  }

  async function run() {
    if (!token || selected.length === 0) {
      window.alert('Escolha pelo menos um cardápio.')
      return
    }

    setBusy(true)
    setErr(null)
    try {
      if (saveFamilyPortions && members.length > 0) {
        const memberSpoons = {}
        for (const m of members) {
          const raw = portionInputs[m.id] != null ? String(portionInputs[m.id]).trim() : '4'
          const n = parseInt(raw.replace(/\D/g, '') || '4', 10)
          memberSpoons[m.id] = Number.isFinite(n) && n > 0 ? n : 4
        }
        await api.updateFamilyPortions(token, { autoActive: true, memberSpoons })
      }

      const res = await api.autoFillPlannerMonth(token, {
        menuIds: selected,
        month: monthStr,
        replace: true,
      })
      const results = res.results || []
      const failed = results.filter((r) => r.error)
      if (failed.length > 0) {
        const msg = failed.map((r) => `${r.menuId?.slice(0, 8)}…: ${r.error}`).join('\n')
        window.alert(`Alguns cardápios não foram preenchidos:\n${msg}`)
      }
      const okN = results.filter((r) => r.ok).length
      if (okN === 0) {
        setBusy(false)
        return
      }

      if (syncShopping) {
        try {
          await api.syncShoppingFromPlanner(token, {
            periodStart: monthRange.periodStart,
            periodEnd: monthRange.periodEnd,
          })
          try {
            sessionStorage.setItem('mealsShoppingPreferSkipMergeOnce', '1')
          } catch {
            /* ignore */
          }
          window.dispatchEvent(new CustomEvent('mealsShoppingReload'))
        } catch (e) {
          window.alert(e?.message || 'Calendário atualizado, mas a lista de compras não pôde ser gerada.')
        }
      }

      window.dispatchEvent(new CustomEvent('mealsPlannerReload'))
      onDone?.()
    } catch (e) {
      setErr(e?.message || 'Não foi possível gerar o mês.')
      window.alert(e?.message || 'Não foi possível gerar o mês.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="meals-planner-auto-wizard" aria-labelledby="meals-planner-auto-title">
      <div className="meals-planner-auto-wizard-top">
        <button type="button" className="meals-planner-auto-back ib" onClick={onBack}>
          ← Voltar
        </button>
        <h2 id="meals-planner-auto-title" className="meals-planner-auto-title">
          Preencher o mês automaticamente
        </h2>
        <p className="meals-planner-auto-lead">
          Marque um ou mais cardápios. Geramos combinações para <strong>cada dia do mês</strong> e atualizamos o calendário
          (o que já estava nesse mês nesses cardápios é trocado). Depois pode ajustar dia a dia.
        </p>
      </div>

      {err ? <div className="feedback error">{err}</div> : null}

      <div className="meals-planner-auto-month-card">
        <div className="meals-planner-auto-month-preview" aria-hidden>
          <span className="meals-planner-auto-month-big">{MONTH_NAMES[plannerMonth.m]}</span>
          <span className="meals-planner-auto-year-big">{plannerMonth.y}</span>
        </div>
        <div className="meals-planner-auto-month-fields">
          <label className="meals-planner-auto-field">
            <span className="meals-planner-auto-field-label">Mês</span>
            <select
              className="sel meals-planner-auto-sel-wide"
              value={plannerMonth.m}
              onChange={(e) =>
                onMonthYMChange?.({ y: plannerMonth.y, m: Number(e.target.value) })
              }
              aria-label="Mês a preencher"
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={name} value={idx}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="meals-planner-auto-field">
            <span className="meals-planner-auto-field-label">Ano</span>
            <select
              className="sel meals-planner-auto-sel-wide"
              value={plannerMonth.y}
              onChange={(e) =>
                onMonthYMChange?.({ y: Number(e.target.value), m: plannerMonth.m })
              }
              aria-label="Ano"
            >
              {yearOptions(plannerMonth.y).map((yy) => (
                <option key={yy} value={yy}>
                  {yy}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {members.length === 0 ? (
        <p className="meals-planner-gate-sub" style={{ marginTop: 12, marginBottom: 0 }}>
          Ainda não há perfis da família (além do gestor) para editar colheres aqui. Pode continuar a gerar o mês; as
          quantidades na lista de compras usarão o que estiver em cada receita.
        </p>
      ) : null}

      {members.length > 0 ? (
        <section className="meals-surface meals-planner-auto-section" aria-labelledby="meals-planner-portions-title">
          <h3 id="meals-planner-portions-title" className="meals-planner-auto-section-title">
            Porções da família
          </h3>
          <p className="meals-planner-auto-section-lead">
            Nas receitas em modo avançado, os ingredientes estão indicados para <strong>1&nbsp;kg</strong> de prato. As
            colheres de sopa por pessoa ajudam a calcular quanto comprar e cozinhar — podem ser guardadas na sua conta ou
            ignoradas neste passo.
          </p>
          {saveFamilyPortions ? (
            <>
              <div className="meals-auto-members" style={{ marginTop: 8 }}>
                {members.map((m) => (
                  <div key={m.id} className="meals-auto-member-row">
                    <label className="meals-auto-member-label" htmlFor={`planner-auto-spoons-${m.id}`}>
                      {m.name}
                    </label>
                    <input
                      id={`planner-auto-spoons-${m.id}`}
                      className="meals-field meals-auto-spoon-input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={portionInputs[m.id] ?? ''}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '')
                        setPortionInputs((prev) => ({ ...prev, [m.id]: digits }))
                      }}
                      onBlur={() => {
                        setPortionInputs((prev) => {
                          const raw = prev[m.id] ?? ''
                          const n = parseInt(String(raw).trim(), 10)
                          const v = Number.isFinite(n) && n > 0 ? String(n) : '4'
                          return { ...prev, [m.id]: v }
                        })
                      }}
                      aria-label={`Colheres de sopa para ${m.name}`}
                    />
                    <span className="meals-auto-member-unit">colheres de sopa</span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="ib meals-planner-auto-skip-link"
                style={{ marginTop: 12 }}
                onClick={() => setSaveFamilyPortions(false)}
              >
                Pular — não guardar porções globais neste passo
              </button>
            </>
          ) : (
            <>
              <p className="meals-planner-gate-sub" style={{ marginTop: 8 }}>
                Vamos usar apenas as porções já definidas em cada receita (e não atualizar colheres na conta).
              </p>
              <button
                type="button"
                className="ib"
                style={{ marginTop: 10 }}
                onClick={() => setSaveFamilyPortions(true)}
              >
                Voltar a mostrar porções
              </button>
            </>
          )}
        </section>
      ) : null}

      <section className="meals-surface meals-planner-auto-section meals-planner-auto-options" aria-label="Opções extra">
        <div className="ti meals-planner-auto-option-row">
          <button
            type="button"
            className={`ck${syncShopping ? ' d' : ''}`}
            onClick={() => setSyncShopping((v) => !v)}
            aria-pressed={syncShopping}
            aria-label={syncShopping ? 'Desmarcar lista de compras' : 'Marcar lista de compras'}
          >
            {syncShopping ? '✓' : ''}
          </button>
          <div className="tl">
            <span className="meals-planner-auto-option-title">Atualizar a lista de compras para este mês</span>
            <span className="meals-planner-auto-option-sub">
              Recalcula ingredientes gerados com base no calendário entre{' '}
              <strong>{monthRange.periodStart}</strong> e <strong>{monthRange.periodEnd}</strong> (mantém entradas
              manuais na lista).
            </span>
          </div>
        </div>
      </section>

      <div className="form-label" style={{ marginTop: 16 }}>
        Cardápios
      </div>
      <p className="meals-planner-gate-sub" style={{ marginTop: 4 }}>
        Pode marcar vários (ex.: almoço e jantar). Cada um recebe o seu tipo de combinação.
      </p>
      <div className="meals-menu-chips meals-planner-auto-chips" role="group" aria-label="Cardápios para gerar">
        {menus.map((m) => {
          const on = selected.includes(m.id)
          return (
            <button
              key={m.id}
              type="button"
              className={`meals-menu-chip${on ? ' meals-menu-chip--on' : ''}`}
              aria-pressed={on}
              onClick={() => toggleMenu(m.id)}
            >
              {m.name}
              {m.isSystemDefault ? (
                <span className="meals-menu-chip-badge" title="Cardápio base">
                  ●
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        className="meals-primary-btn meals-planner-auto-run"
        disabled={busy || selected.length === 0}
        onClick={run}
      >
        {busy ? 'A gerar…' : 'Gerar e ir para o calendário'}
      </button>
    </div>
  )
}
