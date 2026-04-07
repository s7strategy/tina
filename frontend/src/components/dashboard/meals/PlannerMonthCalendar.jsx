import { useMemo, useState } from 'react'
import { localCalendarYmd } from '../../../lib/localDate.js'

const WD_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
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

/** Segunda = primeira coluna (como calendários comuns em PT-BR). */
function mondayOffset(jsDay) {
  return (jsDay + 6) % 7
}

/** Rótulo curto tipo "Seg 6" para títulos de modal. */
export function dayLabelFromYmd(ymd) {
  const parts = String(ymd).split('-').map(Number)
  const y = parts[0]
  const mo = parts[1]
  const dom = parts[2]
  if (!y || !mo || !dom) return String(ymd)
  const d = new Date(y, mo - 1, dom)
  if (Number.isNaN(d.getTime())) return String(ymd)
  const wd = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d.getDay()]
  return `${wd} ${d.getDate()}`
}

/**
 * Calendário de um mês: só números 1…N (dias do mês). Clica no dia → callback com YYYY-MM-DD.
 */
export default function PlannerMonthCalendar({ hasMenusForDay, onDayClick, month: monthProp, onMonthChange }) {
  const [internal, setInternal] = useState(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const controlled = monthProp != null && typeof onMonthChange === 'function'
  const cursor = controlled ? monthProp : internal
  const setCursor = controlled ? onMonthChange : setInternal

  const { grid, monthLabel } = useMemo(() => {
    const { y, m } = cursor
    const first = new Date(y, m, 1)
    const lastDay = new Date(y, m + 1, 0).getDate()
    const pad = mondayOffset(first.getDay())
    const cells = []
    for (let i = 0; i < pad; i++) cells.push(null)
    for (let dom = 1; dom <= lastDay; dom++) {
      const d = new Date(y, m, dom)
      cells.push({ dom, ymd: localCalendarYmd(d) })
    }
    return {
      grid: cells,
      monthLabel: `${MONTH_NAMES[m]} ${y}`,
    }
  }, [cursor])

  function prevMonth() {
    setCursor((c) => {
      let { y, m } = c
      m -= 1
      if (m < 0) {
        m = 11
        y -= 1
      }
      return { y, m }
    })
  }

  function nextMonth() {
    setCursor((c) => {
      let { y, m } = c
      m += 1
      if (m > 11) {
        m = 0
        y += 1
      }
      return { y, m }
    })
  }

  return (
    <div className="meals-month-cal">
      <div className="meals-month-cal-nav">
        <button type="button" className="meals-month-cal-arrow" onClick={prevMonth} aria-label="Mês anterior">
          ‹
        </button>
        <span className="meals-month-cal-title">{monthLabel}</span>
        <button type="button" className="meals-month-cal-arrow" onClick={nextMonth} aria-label="Próximo mês">
          ›
        </button>
      </div>
      <div className="meals-month-cal-weekdays" aria-hidden>
        {WD_LABELS.map((w) => (
          <span key={w} className="meals-month-cal-wd">
            {w}
          </span>
        ))}
      </div>
      <div className="meals-month-cal-grid" role="grid" aria-label="Dias do mês">
        {grid.map((cell, idx) => {
          if (!cell) {
            return <div key={`pad-${cursor.y}-${cursor.m}-${idx}`} className="meals-month-cal-cell meals-month-cal-cell--empty" />
          }
          const on = hasMenusForDay(cell.ymd)
          return (
            <button
              key={cell.ymd}
              type="button"
              className={`meals-month-cal-cell${on ? ' meals-month-cal-cell--on' : ''}`}
              onClick={() => onDayClick(cell.ymd)}
              aria-pressed={on}
              aria-label={`Dia ${cell.dom}`}
            >
              {cell.dom}
            </button>
          )
        })}
      </div>
    </div>
  )
}
