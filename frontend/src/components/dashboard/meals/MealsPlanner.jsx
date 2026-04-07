import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../../lib/api.js'
import Modal from '../../ui/Modal.jsx'
import { RecipeForm } from './RecipeForm.jsx'
import { generateWeekDays, formatWeekRange } from '../../../lib/calendarWeek.js'
import {
  MEAL_CATEGORIES,
  pickRecipePickerValue,
  recipesByCategoryForPicker,
} from '../../../lib/mealCategories.js'
import PlannerModeGate from './PlannerModeGate.jsx'
import PlannerAutoFillWizard from './PlannerAutoFillWizard.jsx'
import PlannerMonthCalendar from './PlannerMonthCalendar.jsx'
function emptyCatPicks() {
  return Object.fromEntries(MEAL_CATEGORIES.map((c) => [c.id, '']))
}

/** Tipos legados (dados antigos); novos itens usam só cardápio + nome/receita (`meal`). */
const SLOT_TYPES = [
  { v: 'breakfast', l: 'Café' },
  { v: 'lunch', l: 'Almoço' },
  { v: 'dinner', l: 'Jantar' },
  { v: 'snack', l: 'Lanche' },
  { v: 'meal', l: '' },
]

/** Opções do select “tipo de refeição” no editor do dia. */
const SLOT_TYPE_SELECT = [
  { v: 'meal', l: 'Refeição' },
  { v: 'breakfast', l: 'Café da manhã' },
  { v: 'lunch', l: 'Almoço' },
  { v: 'dinner', l: 'Jantar' },
  { v: 'snack', l: 'Lanche' },
]

function slotTypeLabel(slotType) {
  if (!slotType || slotType === 'meal') return null
  return SLOT_TYPES.find((x) => x.v === slotType)?.l || slotType
}

function formatTodayLong(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const wdays = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
  const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  return `${wdays[dt.getDay()]}, ${d} de ${months[m - 1]}`
}

const PLANNER_MENU_IDS_KEY = 'meals.plannerSelectedMenuIds'
const PLANNER_PHASE_KEY = 'meals.plannerPhase'

function daySummary(slots) {
  if (!slots?.length) return '—'
  return `${slots.length}`
}

export default function MealsPlanner({ token, members = [], weekOffset, onWeekOffsetChange }) {
  const weekDays = useMemo(() => generateWeekDays(weekOffset), [weekOffset])
  const [phase, setPhase] = useState(() =>
    typeof localStorage !== 'undefined' && localStorage.getItem(PLANNER_PHASE_KEY) === 'main' ? 'main' : 'gate',
  )
  const [plannerMonth, setPlannerMonth] = useState(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [menus, setMenus] = useState([])
  const [selectedMenuIds, setSelectedMenuIds] = useState([])
  const [days, setDays] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [editDate, setEditDate] = useState(null)
  const [recipeModal, setRecipeModal] = useState(false)
  const [recipeEditId, setRecipeEditId] = useState(null)
  const [removingSlotId, setRemovingSlotId] = useState(null)

  const menusForPlanner = useMemo(
    () => menus.filter((m) => selectedMenuIds.includes(m.id)),
    [menus, selectedMenuIds],
  )

  useEffect(() => {
    if (phase === 'main') {
      try {
        localStorage.setItem(PLANNER_PHASE_KEY, 'main')
      } catch {
        /* ignore */
      }
    }
  }, [phase])

  const loadMenus = useCallback(async () => {
    if (!token) return
    try {
      const r = await api.listMenus(token)
      const list = r.menus || []
      setMenus(list)
      setSelectedMenuIds((prev) => {
        const validPrev = prev.filter((id) => list.some((m) => m.id === id))
        let next
        if (validPrev.length > 0) next = validPrev
        else {
          try {
            const raw = localStorage.getItem(PLANNER_MENU_IDS_KEY)
            const saved = raw ? JSON.parse(raw) : null
            const fromSaved = Array.isArray(saved) ? saved.filter((id) => list.some((m) => m.id === id)) : []
            if (fromSaved.length > 0) next = fromSaved
            else next = list.map((m) => m.id)
          } catch {
            next = list.map((m) => m.id)
          }
        }
        const a = [...prev].map(String).sort().join(',')
        const b = [...next].map(String).sort().join(',')
        if (a === b) return prev
        return next
      })
    } catch {
      setMenus([])
    }
  }, [token])

  useEffect(() => {
    if (selectedMenuIds.length > 0) {
      try {
        localStorage.setItem(PLANNER_MENU_IDS_KEY, JSON.stringify(selectedMenuIds))
      } catch {
        /* ignore */
      }
    }
  }, [selectedMenuIds])

  const selectedMenuIdsRef = useRef(selectedMenuIds)
  selectedMenuIdsRef.current = selectedMenuIds
  const menuIdsKey = [...selectedMenuIds].sort().join(',')

  const plannerDateRange = useMemo(() => {
    const { y, m } = plannerMonth
    const pad = (n) => String(n).padStart(2, '0')
    const monthStart = `${y}-${pad(m + 1)}-01`
    const lastD = new Date(y, m + 1, 0).getDate()
    const monthEnd = `${y}-${pad(m + 1)}-${pad(lastD)}`
    const w0 = weekDays[0].fullDate
    const w1 = weekDays[6].fullDate
    const from = monthStart < w0 ? monthStart : w0
    const to = monthEnd > w1 ? monthEnd : w1
    return { from, to }
  }, [plannerMonth, weekDays])

  const load = useCallback(async () => {
    const menuIds = selectedMenuIdsRef.current
    if (!token || menuIds.length === 0) return
    setLoading(true)
    setErr(null)
    try {
      const { from, to } = plannerDateRange
      const res = await api.getMealsPlanner(token, { from, to, menuIds })
      setDays(res.days || [])
    } catch (e) {
      setErr(e?.message || 'Erro ao carregar cardápio.')
    } finally {
      setLoading(false)
    }
  }, [token, plannerDateRange, menuIdsKey])

  useEffect(() => {
    loadMenus()
  }, [loadMenus])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    function onEnsureMenu(e) {
      const id = e.detail?.menuId
      if (!id) return
      setSelectedMenuIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    }
    function onReload() {
      load()
    }
    window.addEventListener('mealsPlannerEnsureMenu', onEnsureMenu)
    window.addEventListener('mealsPlannerReload', onReload)
    return () => {
      window.removeEventListener('mealsPlannerEnsureMenu', onEnsureMenu)
      window.removeEventListener('mealsPlannerReload', onReload)
    }
  }, [load])

  const removePlannerSlot = useCallback(
    async (slotId) => {
      if (!token || !slotId) return
      if (!window.confirm('Remover esta refeição deste dia?')) return
      setRemovingSlotId(slotId)
      try {
        await api.deleteMealPlannerSlot(token, slotId)
        await load()
      } catch (e) {
        window.alert(e?.message || 'Erro ao remover.')
      } finally {
        setRemovingSlotId(null)
      }
    },
    [token, load],
  )

  const byDate = useMemo(() => {
    const m = {}
    for (const d of days) {
      m[d.date] = d.slots || []
    }
    return m
  }, [days])

  const todayInWeek = weekDays.find((d) => d.today)
  const todayYmd = todayInWeek?.fullDate
  const todaySlots = todayYmd ? byDate[todayYmd] || [] : []

  const todayByMenu = useMemo(
    () =>
      menusForPlanner.map((menu) => ({
        menu,
        slots: todaySlots.filter((s) => s.menuId === menu.id),
      })),
    [menusForPlanner, todaySlots],
  )

  const weekDaysRest = useMemo(() => {
    if (todayInWeek) return weekDays.filter((d) => !d.today)
    return weekDays
  }, [weekDays, todayInWeek])

  const [recipesList, setRecipesList] = useState([])
  const [globalRecipesList, setGlobalRecipesList] = useState([])

  useEffect(() => {
    if (!token || !editDate) return
    ;(async () => {
      try {
        const [r, g] = await Promise.all([api.listRecipes(token), api.listGlobalRecipes(token)])
        setRecipesList(r.recipes || [])
        setGlobalRecipesList(g.recipes || [])
      } catch {
        setRecipesList([])
        setGlobalRecipesList([])
      }
    })()
  }, [token, editDate])

  function toggleMenu(id) {
    setSelectedMenuIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev
        return prev.filter((x) => x !== id)
      }
      return [...prev, id]
    })
  }

  async function removeMenu(id) {
    const target = menus.find((x) => x.id === id)
    if (target?.isSystemDefault) {
      window.alert('Os cardápios base não podem ser removidos.')
      return
    }
    if (!id || menus.length <= 1) return
    if (!window.confirm('Excluir este cardápio e as refeições planeadas nele?')) return
    try {
      await api.deleteMenu(token, id)
      await loadMenus()
    } catch (e) {
      window.alert(e?.message || 'Erro.')
    }
  }

  const weekRangeLabel = useMemo(() => formatWeekRange(weekDays), [weekDays])

  const defaultMenuForDay = menusForPlanner[0]?.id || null

  if (phase === 'gate') {
    return (
      <div className="meals-planner meals-planner--gate">
        <PlannerModeGate
          onChooseManual={() => setPhase('main')}
          onChooseAuto={() => setPhase('auto-wizard')}
        />
      </div>
    )
  }

  if (phase === 'auto-wizard') {
    return (
      <div className="meals-planner meals-planner--gate">
        <PlannerAutoFillWizard
          token={token}
          members={members}
          menus={menus}
          plannerMonth={plannerMonth}
          onMonthYMChange={setPlannerMonth}
          onBack={() => setPhase('gate')}
          onDone={() => setPhase('main')}
        />
      </div>
    )
  }

  return (
    <div className="meals-planner">
      <div className="meals-planner-mode-bar">
        <p className="meals-planner-mode-bar-text">A mexer no calendário — quer mudar a forma de começar?</p>
        <button
          type="button"
          className="ib meals-planner-mode-bar-btn"
          onClick={() => {
            try {
              localStorage.removeItem(PLANNER_PHASE_KEY)
            } catch {
              /* ignore */
            }
            setPhase('gate')
          }}
        >
          Modo manual ou automático
        </button>
      </div>

      {err ? <div className="feedback error">{err}</div> : null}

      <section className="meals-surface meals-menu-bar">
        <div className="meals-section-label">Cardápios na semana</div>
        <div className="meals-menu-chips">
          {menus.map((m) => {
            const on = selectedMenuIds.includes(m.id)
            return (
              <button
                key={m.id}
                type="button"
                className={`meals-menu-chip${on ? ' meals-menu-chip--on' : ''}`}
                onClick={() => toggleMenu(m.id)}
                aria-pressed={on}
              >
                {m.name}
                {m.isSystemDefault ? (
                  <span className="meals-menu-chip-badge" title="Cardápio base">
                    ●
                  </span>
                ) : null}
                {menus.length > 1 && !m.isSystemDefault ? (
                  <span
                    role="button"
                    tabIndex={0}
                    className="meals-menu-chip-x"
                    aria-label={`Excluir ${m.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      removeMenu(m.id)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        e.stopPropagation()
                        removeMenu(m.id)
                      }
                    }}
                  >
                    ×
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
        <p className="meals-menu-hint">
          Toque num nome para mostrar ou esconder esse cardápio na semana. As refeições ficam no cardápio que escolher ao adicionar.
        </p>
      </section>

      {todayInWeek && todayYmd ? (
        <section className="meals-today-hero" aria-labelledby="meals-today-heading">
          <div className="meals-today-hero-top">
            <div>
              <div id="meals-today-heading" className="meals-today-kicker">
                Hoje
              </div>
              <div className="meals-today-date">{formatTodayLong(todayYmd)}</div>
            </div>
            <div className="meals-today-badges" aria-label="Cardápios ativos hoje">
              {menusForPlanner.map((m) => (
                <span key={m.id} className="meals-today-badge">
                  {m.name}
                </span>
              ))}
            </div>
          </div>
          <div className="meals-today-body">
            {loading ? (
              <div className="meals-today-loading">A carregar…</div>
            ) : (
              todayByMenu.map(({ menu, slots: sl }) => (
                <div key={menu.id} className="meals-today-menu-block">
                  <div className="meals-today-menu-block-head">
                    <div className="meals-today-menu-label">{menu.name}</div>
                    <button
                      type="button"
                      className="meals-day-quick-add"
                      aria-label={`Adicionar refeição em ${menu.name}`}
                      onClick={() => setEditDate(todayYmd)}
                    >
                      +
                    </button>
                  </div>
                  {sl.length === 0 ? (
                    <div className="meals-today-empty">Nada planeado</div>
                  ) : (
                    <ul className="meals-today-list">
                      {sl.map((s) => (
                        <li key={s.id} className="meals-today-item">
                          <span className="meals-today-item-title">{s.recipeName || s.customTitle || '—'}</span>
                          <div className="meals-today-item-meta">
                            {slotTypeLabel(s.slotType) ? (
                              <span className="meals-today-item-tag">{slotTypeLabel(s.slotType)}</span>
                            ) : null}
                            <button
                              type="button"
                              className="meals-planner-remove-slot"
                              disabled={removingSlotId === s.id}
                              aria-label={`Remover ${s.recipeName || s.customTitle || 'refeição'} deste dia`}
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                removePlannerSlot(s.id)
                              }}
                            >
                              ×
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      <section className="meals-surface meals-planner-month-section" aria-labelledby="meals-planner-month-heading">
        <h3 id="meals-planner-month-heading" className="meals-section-label">
          Calendário do mês
        </h3>
        <p className="meals-menu-hint" style={{ marginTop: 4 }}>
          Toca num dia para ver ou editar as refeições. O mês visível sincroniza com o intervalo que estamos a carregar.
        </p>
        <PlannerMonthCalendar
          month={plannerMonth}
          onMonthChange={setPlannerMonth}
          hasMenusForDay={(ymd) => (byDate[ymd] || []).length > 0}
          onDayClick={(ymd) => setEditDate(ymd)}
        />
      </section>

      {weekDaysRest.length > 0 ? (
        <>
          <div className="meals-week-rest-label">{todayInWeek ? 'Resto da semana' : 'Semana'}</div>
          <div className="meals-planner-week meals-planner-week--rest">
            {weekDaysRest.map((d) => {
              const slots = byDate[d.fullDate] || []
              return (
                <button
                  key={d.fullDate}
                  type="button"
                  className={`meals-week-cell meals-week-cell--rest meals-planner-day${d.today ? ' meals-planner-day--today' : ''}`}
                  onClick={() => setEditDate(d.fullDate)}
                  aria-label={`Abrir dia ${d.fullDate}`}
                >
                  <div className="meals-week-cell-stack">
                    <div className="meals-week-d">{d.name}</div>
                    <div className="meals-week-n">{d.num}</div>
                    <div className="meals-planner-sum">{loading ? '…' : `${daySummary(slots)} ref.`}</div>
                    <span className="meals-week-cell-add" aria-hidden="true">
                      +
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      ) : null}

      <div className="meals-planner-nav meals-planner-nav--bottom">
        <button
          type="button"
          className="meals-nav-ar"
          aria-label="Semana anterior"
          onClick={() => onWeekOffsetChange?.((w) => w - 1)}
        >
          ‹
        </button>
        <span className="meals-planner-range">{weekRangeLabel}</span>
        <button
          type="button"
          className="meals-nav-ar"
          aria-label="Próxima semana"
          onClick={() => onWeekOffsetChange?.((w) => w + 1)}
        >
          ›
        </button>
      </div>

      <Modal isOpen={Boolean(editDate)} id="modal-meals-day" onClose={() => setEditDate(null)} title={editDate ? `Dia ${editDate}` : ''}>
        {editDate && menusForPlanner.length === 0 ? (
          <p className="feedback" style={{ margin: 0 }}>
            Nenhum cardápio ativo. Ativa pelo menos um cardápio na barra acima para planear refeições.
          </p>
        ) : editDate && defaultMenuForDay ? (
          <MealsDayEditor
            token={token}
            menus={menusForPlanner}
            defaultMenuId={defaultMenuForDay}
            date={editDate}
            slots={byDate[editDate] || []}
            userRecipes={recipesList}
            globalRecipes={globalRecipesList}
            onClose={() => setEditDate(null)}
            onSaved={load}
            onNewRecipe={() => { setRecipeEditId(null); setRecipeModal(true) }}
          />
        ) : null}
      </Modal>

      <Modal
        isOpen={recipeModal}
        id="modal-meals-recipe"
        onClose={() => { setRecipeModal(false); setRecipeEditId(null) }}
        title={recipeEditId ? 'Editar receita' : 'Nova receita'}
      >
        <RecipeForm
          token={token}
          recipeId={recipeEditId}
          members={members}
          onSaved={(newId) => {
            ;(async () => {
              try {
                const [r, g] = await Promise.all([api.listRecipes(token), api.listGlobalRecipes(token)])
                setRecipesList(r.recipes || [])
                setGlobalRecipesList(g.recipes || [])
              } catch {
                /* ignore */
              }
            })()
            if (newId) setRecipeEditId(newId)
            else {
              setRecipeModal(false)
              setRecipeEditId(null)
            }
          }}
        />
      </Modal>
    </div>
  )
}

function MealsDayEditor({ token, menus, defaultMenuId, date, slots, userRecipes, globalRecipes, onClose, onSaved, onNewRecipe }) {
  return (
    <div className="meals-day-editor">
      <p className="meals-day-lead">Escolha o cardápio e use um nome livre ou uma receita guardada.</p>
      <SlotList
        token={token}
        menus={menus}
        defaultMenuId={defaultMenuId}
        planDate={date}
        slots={slots}
        userRecipes={userRecipes}
        globalRecipes={globalRecipes}
        onSaved={onSaved}
        onNewRecipe={onNewRecipe}
      />
      <button type="button" className="save-btn" style={{ marginTop: 12, width: '100%' }} onClick={onClose}>
        Fechar
      </button>
    </div>
  )
}

function SlotList({ token, menus, defaultMenuId, planDate, slots, userRecipes, globalRecipes, onSaved, onNewRecipe }) {
  const [adding, setAdding] = useState(false)
  const [slotMenuIds, setSlotMenuIds] = useState([])
  const [mode, setMode] = useState('text')
  const [customTitle, setCustomTitle] = useState('')
  const [recipeId, setRecipeId] = useState('')
  const [removingId, setRemovingId] = useState(null)
  const [slotTypeBusy, setSlotTypeBusy] = useState(null)
  const [randomBusy, setRandomBusy] = useState(null)
  const [catPicks, setCatPicks] = useState(emptyCatPicks)
  const [catBusy, setCatBusy] = useState(false)
  const [recipeFilter, setRecipeFilter] = useState('')
  const globalForkCacheRef = useRef(new Map())

  const menusKey = menus.map((m) => m.id).join(',')

  const recipesByCat = useMemo(
    () => recipesByCategoryForPicker(userRecipes, globalRecipes, recipeFilter),
    [userRecipes, globalRecipes, recipeFilter],
  )

  const combinedRecipeOptions = useMemo(() => {
    const q = recipeFilter.trim().toLowerCase()
    const u = userRecipes
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .map((r) => ({ id: r.id, name: r.name, isGlobal: false }))
    const g = globalRecipes
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .map((r) => ({ id: r.id, name: r.name, isGlobal: true }))
    const combined = [...u, ...g]
    combined.sort((a, b) => {
      if (a.isGlobal !== b.isGlobal) return a.isGlobal ? 1 : -1
      return a.name.localeCompare(b.name, 'pt-BR')
    })
    return combined
  }, [userRecipes, globalRecipes, recipeFilter])

  async function resolvePickToUserRecipeId(pick) {
    if (!pick) return null
    const s = String(pick)
    if (s.startsWith('g:')) {
      const gid = s.slice(2)
      const cached = globalForkCacheRef.current.get(gid)
      if (cached) return cached
      const res = await api.forkGlobalRecipe(token, gid)
      const uid = res.recipe?.id
      if (!uid) throw new Error('Não foi possível importar a receita da Tina.')
      globalForkCacheRef.current.set(gid, uid)
      return uid
    }
    if (s.startsWith('u:')) return s.slice(2)
    return s
  }

  useEffect(() => {
    setSlotMenuIds((prev) => {
      const valid = prev.filter((id) => menus.some((m) => m.id === id))
      if (valid.length > 0) return valid
      const def = defaultMenuId && menus.some((m) => m.id === defaultMenuId) ? defaultMenuId : menus[0]?.id
      return def ? [def] : menus.map((m) => m.id)
    })
  }, [defaultMenuId, menusKey])

  function toggleSlotMenu(menuId) {
    setSlotMenuIds((prev) => {
      if (prev.includes(menuId)) {
        if (prev.length <= 1) return prev
        return prev.filter((x) => x !== menuId)
      }
      return [...prev, menuId]
    })
  }

  async function addSlot() {
    const ids = slotMenuIds.length > 0 ? slotMenuIds : menus.map((m) => m.id)
    if (ids.length === 0) {
      window.alert('Informe um cardápio.')
      return
    }
    try {
      let resolvedRecipeId = null
      if (mode === 'recipe' && recipeId) {
        try {
          resolvedRecipeId = await resolvePickToUserRecipeId(recipeId)
        } catch (e) {
          window.alert(e?.message || 'Erro ao importar receita da Tina.')
          return
        }
      }
      const tasks = []
      for (const menuId of ids) {
        if (mode === 'recipe' && resolvedRecipeId) {
          tasks.push(
            api.createMealPlannerSlot(token, {
              menuId,
              planDate,
              slotType: 'meal',
              recipeId: resolvedRecipeId,
            }),
          )
        } else if (customTitle.trim()) {
          tasks.push(
            api.createMealPlannerSlot(token, {
              menuId,
              planDate,
              slotType: 'meal',
              customTitle: customTitle.trim(),
            }),
          )
        }
      }
      if (tasks.length === 0) {
        window.alert('Informe nome ou receita.')
        return
      }
      await Promise.all(tasks)
      setCustomTitle('')
      setAdding(false)
      onSaved()
    } catch (e) {
      window.alert(e?.message || 'Erro.')
    }
  }

  async function removeSlot(id) {
    if (!window.confirm('Remover esta refeição deste dia?')) return
    try {
      setRemovingId(id)
      await api.deleteMealPlannerSlot(token, id)
      onSaved()
    } catch (e) {
      window.alert(e?.message)
    } finally {
      setRemovingId(null)
    }
  }

  async function addCategorySlots() {
    const ids = slotMenuIds.length > 0 ? slotMenuIds : menus.map((m) => m.id)
    if (ids.length === 0) {
      window.alert('Informe um cardápio.')
      return
    }
    const toAdd = []
    for (const c of MEAL_CATEGORIES) {
      const rid = catPicks[c.id]
      if (rid) toAdd.push(rid)
    }
    if (toAdd.length === 0) {
      window.alert('Escolhe pelo menos uma receita (tuas ou Tina, por categoria).')
      return
    }
    setCatBusy(true)
    try {
      const resolved = []
      for (const rid of toAdd) {
        resolved.push(await resolvePickToUserRecipeId(rid))
      }
      const tasks = []
      for (const menuId of ids) {
        for (const rid of resolved) {
          tasks.push(
            api.createMealPlannerSlot(token, {
              menuId,
              planDate,
              slotType: 'meal',
              recipeId: rid,
            }),
          )
        }
      }
      await Promise.all(tasks)
      setCatPicks(emptyCatPicks())
      onSaved()
    } catch (e) {
      window.alert(e?.message || 'Erro ao importar receita da Tina.')
    } finally {
      setCatBusy(false)
    }
  }

  async function saveComboFromSlot() {
    const name = window.prompt('Nome do prato')
    if (!name?.trim()) return
    const items = []
    try {
      for (const c of MEAL_CATEGORIES) {
        const rid = catPicks[c.id]
        if (rid) {
          const uid = await resolvePickToUserRecipeId(rid)
          items.push({ mealCategory: c.id, recipeId: uid })
        }
      }
    } catch (e) {
      window.alert(e?.message || 'Erro ao importar receita.')
      return
    }
    if (items.length === 0) {
      window.alert('Escolhe pelo menos uma receita.')
      return
    }
    try {
      await api.createMealCombination(token, { name: name.trim(), items })
      window.alert('Prato guardado.')
    } catch (e) {
      window.alert(e?.message || 'Erro.')
    }
  }

  return (
    <div style={{ marginTop: 4 }}>
      {(slots || []).map((s) => (
        <div key={s.id} className="meals-slot-row meals-slot-row--tools">
          <div className="meals-slot-row-info">
            <span className="meals-slot-type">
              {s.menuName ? <span className="meals-slot-menu">{s.menuName}</span> : null}
              {slotTypeLabel(s.slotType) ? <span className="meals-slot-type-pill">{slotTypeLabel(s.slotType)}</span> : null}
            </span>
            <span className="meals-slot-title">{s.recipeName || s.customTitle || '—'}</span>
          </div>
          <div className="meals-slot-tool-row">
            <label className="meals-slot-field-label">
              <span className="sr-only">Tipo de refeição</span>
              <select
                className="sel meals-slot-type-sel"
                value={s.slotType && SLOT_TYPE_SELECT.some((o) => o.v === s.slotType) ? s.slotType : 'meal'}
                disabled={slotTypeBusy === s.id}
                aria-label={`Tipo de refeição: ${s.recipeName || s.customTitle || 'linha'}`}
                onChange={async (e) => {
                  setSlotTypeBusy(s.id)
                  try {
                    await api.updateMealPlannerSlot(token, s.id, { slotType: e.target.value })
                    onSaved()
                  } catch (err) {
                    window.alert(err?.message || 'Erro ao atualizar o tipo.')
                  } finally {
                    setSlotTypeBusy(null)
                  }
                }}
              >
                {SLOT_TYPE_SELECT.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="ib meals-slot-random"
              disabled={!s.recipeId || randomBusy === s.id}
              title="Trocar por outra receita aleatória na mesma categoria (catálogo Tina ou tuas)"
              onClick={async () => {
                setRandomBusy(s.id)
                try {
                  await api.randomizeMealPlannerSlot(token, s.id)
                  onSaved()
                } catch (err) {
                  window.alert(err?.message || 'Não foi possível aleatorizar.')
                } finally {
                  setRandomBusy(null)
                }
              }}
            >
              {randomBusy === s.id ? '…' : 'Aleatorizar'}
            </button>
            <button
              type="button"
              className="meals-planner-remove-slot"
              disabled={removingId === s.id}
              aria-label={`Remover ${s.recipeName || s.customTitle || 'refeição'} deste dia`}
              onClick={() => removeSlot(s.id)}
            >
              Excluir
            </button>
          </div>
        </div>
      ))}
      <div className="meals-slot-cat-wrap">
        <div className="form-label" style={{ marginTop: 10 }}>
          Por categoria <span style={{ fontWeight: 600, color: 'var(--t3)', fontSize: '0.85em' }}>(opcional)</span>
        </div>
        <p className="meals-day-lead" style={{ marginTop: 2 }}>
          Uma receita por tipo (carboidrato, proteína…). As tuas receitas precisam de categoria em Receitas; as da Tina aparecem
          por tipo ou em todas as linhas se forem gerais.
        </p>
        <div className="form-label" style={{ marginTop: 8 }}>
          Cardápios
        </div>
        <div className="meals-menu-chips" role="group" aria-label="Cardápios para por categoria">
          {menus.map((m) => {
            const on = slotMenuIds.includes(m.id)
            return (
              <button
                key={m.id}
                type="button"
                className={`meals-menu-chip${on ? ' meals-menu-chip--on' : ''}`}
                aria-pressed={on}
                onClick={() => toggleSlotMenu(m.id)}
              >
                {m.name}
              </button>
            )
          })}
        </div>
        <input
          type="search"
          className="meals-recipes-search"
          placeholder="Buscar receita... (ex.: frango, bolo, sopa)"
          value={recipeFilter}
          onChange={(e) => setRecipeFilter(e.target.value)}
          style={{ marginTop: 8 }}
          aria-label="Filtrar receitas por nome"
        />
        <div className="meals-combos-grid meals-combos-grid--compact">
          {MEAL_CATEGORIES.map((c) => (
            <div key={c.id} className="meals-combos-row">
              <span className="meals-combos-cat">{c.label}</span>
              <select
                className="sel meals-combos-select"
                value={catPicks[c.id]}
                onChange={(e) => setCatPicks((p) => ({ ...p, [c.id]: e.target.value }))}
                disabled={catBusy}
                aria-label={`Receita ${c.label}`}
              >
                <option value="">—</option>
                {(recipesByCat.get(c.id) || []).map((r) => (
                  <option key={`${pickRecipePickerValue(r)}-${c.id}`} value={pickRecipePickerValue(r)}>
                    {r.isGlobal ? `Tina · ${r.name}` : r.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="meals-slot-cat-actions">
          <button type="button" className="save-btn" disabled={catBusy} onClick={addCategorySlots}>
            {catBusy ? 'A adicionar…' : 'Adicionar ao dia'}
          </button>
          <button type="button" className="meals-slot-save-combo" disabled={catBusy} onClick={saveComboFromSlot}>
            Guardar como prato
          </button>
        </div>
      </div>
      {!adding ? (
        <button type="button" className="ib" style={{ marginTop: 6 }} onClick={() => setAdding(true)}>
          + Refeição
        </button>
      ) : (
        <div className="meals-add-slot">
          <div className="form-label" style={{ marginBottom: 4 }}>
            Cardápios
          </div>
          <div className="meals-menu-chips" role="group" aria-label="Cardápios para nova refeição">
            {menus.map((m) => {
              const on = slotMenuIds.includes(m.id)
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`meals-menu-chip${on ? ' meals-menu-chip--on' : ''}`}
                  aria-pressed={on}
                  onClick={() => toggleSlotMenu(m.id)}
                >
                  {m.name}
                </button>
              )
            })}
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label className="radio-opt">
              <input type="radio" checked={mode === 'text'} onChange={() => setMode('text')} />
              Nome
            </label>
            <label className="radio-opt">
              <input type="radio" checked={mode === 'recipe'} onChange={() => setMode('recipe')} />
              Receita
            </label>
          </div>
          {mode === 'text' ? (
            <input placeholder="Ex: Macarrão" value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} style={{ marginTop: 6 }} />
          ) : (
            <div style={{ marginTop: 6 }}>
              <input
                className="meals-field"
                type="search"
                placeholder="Buscar receita... (ex.: frango, bolo, sopa)"
                value={recipeFilter}
                onChange={(e) => setRecipeFilter(e.target.value)}
                aria-label="Filtrar receitas"
                style={{ marginBottom: 6 }}
              />
              <select className="sel" value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
                <option value="">Escolher receita…</option>
                {combinedRecipeOptions.map((r) => (
                  <option key={pickRecipePickerValue(r)} value={pickRecipePickerValue(r)}>
                    {r.isGlobal ? `Tina · ${r.name}` : r.name}
                  </option>
                ))}
              </select>
              <button type="button" className="ib" style={{ marginTop: 6 }} onClick={onNewRecipe}>
                Criar receita nova…
              </button>
            </div>
          )}
          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            <button type="button" className="save-btn" onClick={addSlot}>
              Adicionar
            </button>
            <button type="button" className="ib" onClick={() => setAdding(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
