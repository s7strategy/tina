import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, Lightbulb } from 'lucide-react'
import { api } from '../../../lib/api.js'
import {
  MEAL_CATEGORIES,
  mealCategoryLabel,
  pickRecipePickerValue,
  recipesByCategoryForPicker,
} from '../../../lib/mealCategories.js'
import Modal from '../../ui/Modal.jsx'
import PlannerMonthCalendar, { dayLabelFromYmd } from './PlannerMonthCalendar.jsx'
const PLANNER_MENU_IDS_KEY = 'meals.plannerSelectedMenuIds'

function emptyPicks() {
  return Object.fromEntries(MEAL_CATEGORIES.map((c) => [c.id, '']))
}

function ensurePlannerMenusAndReload(menuIds) {
  try {
    const raw = localStorage.getItem(PLANNER_MENU_IDS_KEY)
    const saved = raw ? JSON.parse(raw) : null
    const arr = Array.isArray(saved) ? [...saved] : []
    for (const mid of menuIds) {
      if (!arr.includes(mid)) arr.push(mid)
    }
    localStorage.setItem(PLANNER_MENU_IDS_KEY, JSON.stringify(arr))
  } catch {
    /* ignore */
  }
  for (const mid of menuIds) {
    window.dispatchEvent(new CustomEvent('mealsPlannerEnsureMenu', { detail: { menuId: mid } }))
  }
  window.dispatchEvent(new CustomEvent('mealsPlannerReload'))
}

/** Estado do modal: escolher cardápios para um dia (criar ou aplicar combinação guardada). */
function emptyDayMenuPick() {
  return null
}

export default function MealsCombinations({ token }) {
  const [combos, setCombos] = useState([])
  const [userRecipes, setUserRecipes] = useState([])
  const [globalRecipes, setGlobalRecipes] = useState([])
  const [menus, setMenus] = useState([])
  const [loading, setLoading] = useState(true)
  const [nameDraft, setNameDraft] = useState('')
  const [picks, setPicks] = useState(emptyPicks)
  /** Por dia (YYYY-MM-DD): ids de cardápio onde a combinação nova entra ao guardar. */
  const [createDateMenus, setCreateDateMenus] = useState({})
  /** Por combinação guardada: por dia, cardápios para aplicar. */
  const [comboApply, setComboApply] = useState({})
  const [dayMenuPick, setDayMenuPick] = useState(emptyDayMenuPick)
  const [pickDraft, setPickDraft] = useState([])
  const [dicaOpen, setDicaOpen] = useState(false)
  const [createPratoOpen, setCreatePratoOpen] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [r, g, c, m] = await Promise.all([
        api.listRecipes(token),
        api.listGlobalRecipes(token),
        api.listMealCombinations(token),
        api.listMenus(token),
      ])
      setUserRecipes(r.recipes || [])
      setGlobalRecipes(g.recipes || [])
      setCombos(c.combinations || [])
      setMenus(m.menus || [])
    } catch {
      setUserRecipes([])
      setGlobalRecipes([])
      setCombos([])
      setMenus([])
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setComboApply((prev) => {
      const next = { ...prev }
      for (const co of combos) {
        const existing = next[co.id]
        const dateMenus = existing?.dateMenus && typeof existing.dateMenus === 'object' ? { ...existing.dateMenus } : {}
        for (const ymd of Object.keys(dateMenus)) {
          dateMenus[ymd] = (dateMenus[ymd] || []).filter((id) => menus.some((x) => x.id === id))
          if (dateMenus[ymd].length === 0) delete dateMenus[ymd]
        }
        next[co.id] = { dateMenus }
      }
      for (const k of Object.keys(next)) {
        if (!combos.some((c) => c.id === k)) delete next[k]
      }
      return next
    })
  }, [combos, menus])

  /** Por categoria: tuas receitas primeiro, depois Tina (alfabético em cada grupo). Tina “geral” em todas as linhas. */
  const recipesByCat = useMemo(
    () => recipesByCategoryForPicker(userRecipes, globalRecipes, ''),
    [userRecipes, globalRecipes],
  )

  function defaultMenusForDay(ymd, getExisting) {
    const cur = getExisting(ymd)
    if (cur?.length) return [...cur]
    return menus.map((m) => m.id)
  }

  function openDayMenuPick(mode, ymd, comboId) {
    const getExisting =
      mode === 'create'
        ? (d) => createDateMenus[d]
        : (d) => comboApply[comboId]?.dateMenus?.[d]
    setPickDraft(defaultMenusForDay(ymd, getExisting))
    setDayMenuPick(mode === 'create' ? { mode: 'create', ymd } : { mode: 'apply', comboId, ymd })
  }

  function togglePickDraft(menuId) {
    setPickDraft((prev) => {
      if (prev.includes(menuId)) {
        if (prev.length <= 1) return prev
        return prev.filter((x) => x !== menuId)
      }
      return [...prev, menuId]
    })
  }

  function confirmDayMenuPick() {
    if (!dayMenuPick) return
    const { mode, ymd } = dayMenuPick
    if (pickDraft.length === 0) {
      if (mode === 'create') {
        setCreateDateMenus((prev) => {
          const n = { ...prev }
          delete n[ymd]
          return n
        })
      } else {
        const comboId = dayMenuPick.comboId
        setComboApply((prev) => {
          const cur = prev[comboId] || { dateMenus: {} }
          const dm = { ...cur.dateMenus }
          delete dm[ymd]
          return { ...prev, [comboId]: { dateMenus: dm } }
        })
      }
    } else if (mode === 'create') {
      setCreateDateMenus((prev) => ({ ...prev, [ymd]: [...pickDraft] }))
    } else {
      const comboId = dayMenuPick.comboId
      setComboApply((prev) => {
        const cur = prev[comboId] || { dateMenus: {} }
        return { ...prev, [comboId]: { dateMenus: { ...cur.dateMenus, [ymd]: [...pickDraft] } } }
      })
    }
    setDayMenuPick(emptyDayMenuPick())
  }

  async function saveCombo() {
    if (!nameDraft.trim()) {
      window.alert('Dá um nome ao prato.')
      return
    }
    const forkOnce = new Map()
    async function resolveUserRecipeId(raw) {
      if (!raw) return null
      if (raw.startsWith('u:')) return raw.slice(2)
      if (raw.startsWith('g:')) {
        const gid = raw.slice(2)
        if (forkOnce.has(gid)) return forkOnce.get(gid)
        const res = await api.forkGlobalRecipe(token, gid)
        const uid = res.recipe?.id
        if (!uid) throw new Error('Não foi possível importar uma receita da Tina.')
        forkOnce.set(gid, uid)
        return uid
      }
      return raw
    }

    const items = []
    try {
      for (const c of MEAL_CATEGORIES) {
        const raw = picks[c.id]
        if (!raw) continue
        const recipeId = await resolveUserRecipeId(raw)
        if (recipeId) items.push({ mealCategory: c.id, recipeId })
      }
    } catch (e) {
      window.alert(e?.message || 'Erro ao importar receita da Tina.')
      return
    }
    if (items.length === 0) {
      window.alert('Escolhe pelo menos uma receita com categoria.')
      return
    }
    try {
      const res = await api.createMealCombination(token, { name: nameDraft.trim(), items })
      const newId = res.combination?.id
      const entries = Object.entries(createDateMenus).filter(([, ids]) => ids?.length > 0)
      const didApply = Boolean(newId && entries.length > 0)
      if (didApply) {
        const allMenuIds = new Set()
        for (const [ymd, menuIds] of entries) {
          await api.applyMealCombination(token, newId, { menuIds, dates: [ymd] })
          menuIds.forEach((id) => allMenuIds.add(id))
        }
        ensurePlannerMenusAndReload([...allMenuIds])
      }
      setNameDraft('')
      setPicks(emptyPicks())
      setCreateDateMenus({})
      setCreatePratoOpen(false)
      await load()
      window.alert(didApply ? 'Prato guardado e adicionado ao cardápio nos dias escolhidos.' : 'Prato guardado.')
    } catch (e) {
      window.alert(e?.message || 'Erro ao guardar.')
    }
  }

  async function delCombo(id) {
    if (!window.confirm('Apagar este prato guardado?')) return
    try {
      await api.deleteMealCombination(token, id)
      await load()
    } catch (e) {
      window.alert(e?.message || 'Erro.')
    }
  }

  async function applyComboFor(comboId) {
    const dateMenus = comboApply[comboId]?.dateMenus || {}
    const entries = Object.entries(dateMenus).filter(([, ids]) => ids?.length > 0)
    if (entries.length === 0) {
      window.alert('Escolhe dias e cardápios: toca num dia e marca os cardápios.')
      return
    }
    try {
      const allMenuIds = new Set()
      for (const [ymd, menuIds] of entries) {
        await api.applyMealCombination(token, comboId, { menuIds, dates: [ymd] })
        menuIds.forEach((id) => allMenuIds.add(id))
      }
      ensurePlannerMenusAndReload([...allMenuIds])
      setComboApply((prev) => ({
        ...prev,
        [comboId]: { dateMenus: {} },
      }))
      window.alert('Prato adicionado ao cardápio nos dias escolhidos.')
    } catch (e) {
      window.alert(e?.message || 'Erro.')
    }
  }

  const pickModalTitle =
    dayMenuPick?.ymd ? `Cardápios — ${dayLabelFromYmd(dayMenuPick.ymd)}` : ''

  if (!token) {
    return <div className="feedback error">Sessão inválida.</div>
  }

  return (
    <div className="meals-combos">
      <div className="meals-combos-intro">
        <h2 className="meals-recipes-section-heading meals-combos-intro-heading">Monte o seu prato</h2>
        <p className="meals-combos-intro-desc">
          Monte um prato completo com os itens principais da alimentação: base, proteína e salada.
        </p>
        <p className="meals-combos-lead-example">
          Exemplo: arroz + feijão + carne + salada de alface e tomate.
        </p>
        <div className="meals-combos-dica-wrap">
          <button
            type="button"
            className={`mobile-more-tip-trigger${dicaOpen ? ' is-open' : ''}`}
            onClick={() => setDicaOpen((o) => !o)}
            aria-expanded={dicaOpen}
            aria-controls="meals-combos-dica-panel"
            id="meals-combos-dica-btn"
          >
            <Lightbulb size={16} strokeWidth={2.25} className="mobile-more-tip-trigger-ic" aria-hidden />
            <span className="mobile-more-tip-trigger-txt">Dica</span>
            <ChevronDown size={18} strokeWidth={2.25} className="mobile-more-tip-chevron" aria-hidden />
          </button>
          {dicaOpen ? (
            <div
              id="meals-combos-dica-panel"
              role="region"
              aria-labelledby="meals-combos-dica-btn"
              className="mobile-more-tip-panel"
            >
              <p>Um prato completo geralmente tem base + proteína + salada.</p>
            </div>
          ) : null}
        </div>
      </div>

      {loading ? <div className="feedback">A carregar…</div> : null}

      <div className="meals-combos-create-toolbar">
        <button
          type="button"
          className="meals-primary-btn meals-combos-open-create"
          onClick={() => setCreatePratoOpen(true)}
        >
          Criar prato
        </button>
      </div>

      <section className="meals-combos-card">
        <div className="meals-combos-card-title">Os teus pratos</div>
        {combos.length === 0 ? (
          <p className="meals-combos-empty">Ainda não há pratos guardados.</p>
        ) : (
          <ul className="meals-combos-list">
            {combos.map((co) => {
              const dateMenus = comboApply[co.id]?.dateMenus || {}
              return (
                <li key={co.id} className="meals-combos-li">
                  <div className="meals-combos-li-head">
                    <strong>{co.name}</strong>
                    <button type="button" className="meals-combos-del" onClick={() => delCombo(co.id)} aria-label="Apagar">
                      ×
                    </button>
                  </div>
                  <ul className="meals-combos-items">
                    {(co.items || []).map((it) => (
                      <li key={it.id}>
                        <span className="meals-combos-it-cat">{mealCategoryLabel(it.mealCategory)}</span>
                        <span className="meals-combos-it-name">{it.recipeName}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="meals-combos-repeat">
                    <p className="meals-combos-hint" style={{ marginTop: 6 }}>
                      Calendário do mês: toca num dia e escolhe os cardápios ao centro.
                    </p>
                    <div className="form-label" style={{ marginTop: 8 }}>
                      Calendário
                    </div>
                    <PlannerMonthCalendar
                      hasMenusForDay={(ymd) => (dateMenus[ymd]?.length ?? 0) > 0}
                      onDayClick={(ymd) => openDayMenuPick('apply', ymd, co.id)}
                    />
                    <button type="button" className="meals-primary-btn meals-combos-apply" onClick={() => applyComboFor(co.id)}>
                      Adicionar ao cardápio
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <Modal
        isOpen={Boolean(dayMenuPick)}
        id="modal-meals-combo-day-menus"
        onClose={() => setDayMenuPick(emptyDayMenuPick())}
        title={pickModalTitle}
      >
        <p className="meals-combos-hint" style={{ marginTop: 0 }}>
          Em que cardápios queres este prato neste dia? Podes marcar vários.
        </p>
        <div className="meals-menu-chips" role="group" aria-label="Cardápios para este dia">
          {menus.map((m) => {
            const on = pickDraft.includes(m.id)
            return (
              <button
                key={m.id}
                type="button"
                className={`meals-menu-chip${on ? ' meals-menu-chip--on' : ''}`}
                aria-pressed={on}
                onClick={() => togglePickDraft(m.id)}
              >
                {m.name}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          <button type="button" className="meals-primary-btn" style={{ flex: '1 1 auto', minWidth: 120 }} onClick={confirmDayMenuPick}>
            Guardar neste dia
          </button>
          <button type="button" className="ib" style={{ flex: '1 1 auto' }} onClick={() => setDayMenuPick(emptyDayMenuPick())}>
            Cancelar
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={createPratoOpen}
        id="modal-meals-create-prato"
        onClose={() => setCreatePratoOpen(false)}
        title="Criar prato"
      >
        <div className="meals-create-prato-modal">
          <p className="meals-combos-hint" style={{ marginTop: 0 }}>
            Escolhe receitas para cada parte do prato. Opcionalmente indica dias no calendário para já adicionar ao cardápio.
          </p>
          <div className="form-label">Nome do prato</div>
          <input
            className="meals-field"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="Ex: Almoço simples"
          />
          <p className="meals-combos-hint meals-combos-hint--create">
            Escolha uma opção para cada parte do prato.
          </p>
          <div className="meals-combos-grid">
            {MEAL_CATEGORIES.map((c) => (
              <div key={c.id} className="meals-combos-row">
                <span className="meals-combos-cat">{c.label}</span>
                <select
                  className="sel meals-combos-select"
                  value={picks[c.id]}
                  onChange={(e) => setPicks((p) => ({ ...p, [c.id]: e.target.value }))}
                  aria-label={`Receita para ${c.label}`}
                >
                  <option value="">—</option>
                  {(recipesByCat.get(c.id) || []).map((r) => (
                    <option key={pickRecipePickerValue(r)} value={pickRecipePickerValue(r)}>
                      {r.isGlobal ? `Tina · ${r.name}` : r.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="form-label" style={{ marginTop: 10 }}>
            Repetir no cardápio <span style={{ fontWeight: 600, color: 'var(--t3)', fontSize: '0.85em' }}>(opcional)</span>
          </div>
          <p className="meals-combos-hint" style={{ marginTop: 4 }}>
            Toca num <strong>dia</strong> no calendário (1 a 31) e escolhe os cardápios ao centro (ex.: só almoço nesse dia).
          </p>
          <div className="form-label">Calendário</div>
          <PlannerMonthCalendar
            hasMenusForDay={(ymd) => (createDateMenus[ymd]?.length ?? 0) > 0}
            onDayClick={(ymd) => openDayMenuPick('create', ymd)}
          />
          <div className="meals-combos-modal-footer">
            <button type="button" className="meals-primary-btn meals-combos-save meals-combos-save--inline" onClick={saveCombo}>
              Guardar prato
            </button>
            <button type="button" className="ib" onClick={() => setCreatePratoOpen(false)}>
              Cancelar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
