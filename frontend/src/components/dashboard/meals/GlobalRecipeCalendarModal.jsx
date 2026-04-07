import { useEffect, useState } from 'react'
import { api } from '../../../lib/api.js'
import Modal from '../../ui/Modal.jsx'
import PlannerMonthCalendar, { dayLabelFromYmd } from './PlannerMonthCalendar.jsx'

const PLANNER_MENU_IDS_KEY = 'meals.plannerSelectedMenuIds'

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

/**
 * Depois de importar uma receita Tina, escolher dias e cardápios (mesmo fluxo que em Editar receita).
 */
export default function GlobalRecipeCalendarModal({ token, recipeId, onClose, onDone }) {
  const [plannerMenus, setPlannerMenus] = useState([])
  const [plannerDateMenus, setPlannerDateMenus] = useState({})
  const [recipeDayMenuPick, setRecipeDayMenuPick] = useState(null)
  const [recipeMenuPickDraft, setRecipeMenuPickDraft] = useState([])

  useEffect(() => {
    if (!token) return
    ;(async () => {
      try {
        const r = await api.listMenus(token)
        setPlannerMenus(r.menus || [])
      } catch {
        setPlannerMenus([])
      }
    })()
  }, [token])

  function openRecipeDayMenuPick(ymd) {
    const existing = plannerDateMenus[ymd]
    setRecipeMenuPickDraft(
      existing?.length ? [...existing] : plannerMenus.map((m) => m.id),
    )
    setRecipeDayMenuPick({ ymd })
  }

  function toggleRecipeMenuPickDraft(menuId) {
    setRecipeMenuPickDraft((prev) => {
      if (prev.includes(menuId)) {
        if (prev.length <= 1) return prev
        return prev.filter((x) => x !== menuId)
      }
      return [...prev, menuId]
    })
  }

  function confirmRecipeDayMenuPick() {
    if (!recipeDayMenuPick) return
    const { ymd } = recipeDayMenuPick
    setPlannerDateMenus((prev) => {
      const n = { ...prev }
      if (recipeMenuPickDraft.length === 0) delete n[ymd]
      else n[ymd] = [...recipeMenuPickDraft]
      return n
    })
    setRecipeDayMenuPick(null)
  }

  async function submit() {
    const entries = Object.entries(plannerDateMenus).filter(([, ids]) => ids?.length > 0)
    if (entries.length === 0) {
      window.alert('Escolhe pelo menos um dia no calendário e os cardápios nesse dia.')
      return
    }
    try {
      const menuIdsUsed = new Set()
      const tasks = []
      for (const [planDate, menuIds] of entries) {
        for (const menuId of menuIds) {
          menuIdsUsed.add(menuId)
          tasks.push(
            api.createMealPlannerSlot(token, {
              menuId,
              planDate,
              slotType: 'meal',
              recipeId,
            }),
          )
        }
      }
      await Promise.all(tasks)
      ensurePlannerMenusAndReload([...menuIdsUsed])
      setPlannerDateMenus({})
      window.alert('Receita adicionada ao cardápio.')
      onDone?.()
      onClose()
    } catch (e) {
      window.alert(e?.message || 'Erro ao planear.')
    }
  }

  return (
    <Modal isOpen={true} id="modal-global-recipe-calendar" onClose={onClose} title="Adicionar ao calendário">
      <p className="meals-recipe-plan-hint" style={{ marginTop: 0 }}>
        Toca num <strong>dia</strong> (1 a 31) e escolhe os <strong>cardápios</strong> ao centro. Depois confirma abaixo.
      </p>
      <div className="form-label">Calendário</div>
      <PlannerMonthCalendar
        hasMenusForDay={(ymd) => (plannerDateMenus[ymd]?.length ?? 0) > 0}
        onDayClick={openRecipeDayMenuPick}
      />
      <button type="button" className="meals-primary-btn" style={{ width: '100%', marginTop: 8 }} onClick={submit}>
        Confirmar no cardápio
      </button>
      <button type="button" className="ib" style={{ width: '100%', marginTop: 8 }} onClick={onClose}>
        Cancelar
      </button>

      <Modal
        isOpen={Boolean(recipeDayMenuPick)}
        id="modal-global-recipe-day-menus"
        onClose={() => setRecipeDayMenuPick(null)}
        title={recipeDayMenuPick ? `Cardápios — ${dayLabelFromYmd(recipeDayMenuPick.ymd)}` : ''}
      >
        <p className="meals-recipe-plan-hint" style={{ marginTop: 0 }}>
          Em que cardápios entra esta receita neste dia?
        </p>
        <div className="meals-menu-chips" role="group" aria-label="Cardápios para este dia">
          {plannerMenus.map((m) => {
            const on = recipeMenuPickDraft.includes(m.id)
            return (
              <button
                key={m.id}
                type="button"
                className={`meals-menu-chip${on ? ' meals-menu-chip--on' : ''}`}
                aria-pressed={on}
                onClick={() => toggleRecipeMenuPickDraft(m.id)}
              >
                {m.name}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          <button
            type="button"
            className="meals-primary-btn"
            style={{ flex: '1 1 auto', minWidth: 120 }}
            onClick={confirmRecipeDayMenuPick}
          >
            Guardar neste dia
          </button>
          <button type="button" className="ib" style={{ flex: '1 1 auto' }} onClick={() => setRecipeDayMenuPick(null)}>
            Cancelar
          </button>
        </div>
      </Modal>
    </Modal>
  )
}
