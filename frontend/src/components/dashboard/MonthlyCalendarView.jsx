import { useEffect, useState, useCallback } from 'react'
import { useAppData } from '../../context/AppDataContext.jsx'

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const DAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

function getMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  let startDow = firstDay.getDay()
  if (startDow === 0) startDow = 7
  const prefixDays = startDow - 1

  const cells = []
  for (let i = 0; i < prefixDays; i++) {
    const d = new Date(year, month, 1 - (prefixDays - i))
    cells.push({ date: d, currentMonth: false })
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    cells.push({ date: new Date(year, month, d), currentMonth: true })
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), currentMonth: false })
  }
  return cells
}

function toDateStr(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function isToday(d) {
  const today = new Date()
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()
}

export default function MonthlyCalendarView({ workspace, profiles, currentProf, openModal }) {
  const { fetchEventsDirect } = useAppData()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [events, setEvents] = useState([])
  const [selectedDay, setSelectedDay] = useState(null)
  const [loading, setLoading] = useState(false)

  const isManager = currentProf === 'gestor'

  const loadEvents = useCallback(async () => {
    setLoading(true)
    try {
      const from = toDateStr(new Date(year, month, 1))
      const to = toDateStr(new Date(year, month + 1, 0))
      const result = await fetchEventsDirect({ from, to })
      setEvents(result?.events ?? [])
    } catch {
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [year, month, fetchEventsDirect])

  useEffect(() => { void loadEvents() }, [loadEvents])

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) } else { setMonth(m => m - 1) }
    setSelectedDay(null)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) } else { setMonth(m => m + 1) }
    setSelectedDay(null)
  }

  function getEventsForDate(dateStr) {
    return events.filter((ev) => {
      if (ev.eventDate === dateStr) return true
      if (ev.recurrenceType === 'semanal' && ev.recurrenceDays) {
        const d = new Date(dateStr + 'T12:00:00')
        const dowLabels = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
        const dayLabel = dowLabels[d.getDay()]
        return ev.recurrenceDays.toLowerCase().split(',').map(s => s.trim()).includes(dayLabel)
      }
      return false
    }).filter((ev) => {
      if (isManager) return true
      return ev.members && ev.members.includes(currentProf)
    })
  }

  const grid = getMonthGrid(year, month)
  const selectedDateStr = selectedDay ? toDateStr(selectedDay) : null
  const selectedEvents = selectedDateStr ? getEventsForDate(selectedDateStr) : []

  return (
    <div>
      <div className="card" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button className="ar" onClick={prevMonth} aria-label="Mês anterior">‹</button>
          <span style={{ fontFamily: "'Plus Jakarta Sans'", fontWeight: 800, fontSize: '0.95em' }}>
            {MONTH_NAMES[month]} {year}
          </span>
          <button className="ar" onClick={nextMonth} aria-label="Próximo mês">›</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1, marginBottom: 4 }}>
          {DAY_LABELS.map((d) => (
            <div key={d} style={{ textAlign: 'center', fontSize: '0.6em', fontWeight: 700, color: 'var(--t3)', padding: '2px 0' }}>{d}</div>
          ))}
        </div>

        {loading ? (
          <div className="empty-state">Carregando...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1, background: 'var(--bd)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--bd)' }}>
            {grid.map((cell, i) => {
              const dateStr = toDateStr(cell.date)
              const dayEvents = getEventsForDate(dateStr)
              const todayCell = isToday(cell.date)
              const selected = selectedDateStr === dateStr
              return (
                <div
                  key={i}
                  onClick={() => setSelectedDay(cell.currentMonth ? cell.date : null)}
                  style={{
                    background: selected ? '#ede9ff' : todayCell ? '#fffbeb' : 'var(--w)',
                    padding: '4px 3px',
                    minHeight: 48,
                    cursor: cell.currentMonth ? 'pointer' : 'default',
                    opacity: cell.currentMonth ? 1 : 0.35,
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{
                    fontFamily: "'Plus Jakarta Sans'", fontWeight: 700, fontSize: '0.75em',
                    marginBottom: 2, textAlign: 'center',
                    background: todayCell ? 'var(--am)' : 'transparent',
                    color: todayCell ? 'white' : 'var(--t1)',
                    width: todayCell ? 20 : 'auto', height: todayCell ? 20 : 'auto',
                    borderRadius: todayCell ? '50%' : 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: todayCell ? '0 auto 2px' : '0 auto 2px',
                  }}>
                    {cell.date.getDate()}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {dayEvents.slice(0, 2).map((ev) => {
                      const color = isManager && ev.members?.[0] ? (profiles[ev.members[0]]?.color ?? 'var(--mae)') : (profiles[currentProf]?.color ?? 'var(--mae)')
                      return (
                        <div key={ev.id} style={{ fontSize: '0.5em', background: color + '22', borderLeft: `2px solid ${color}`, borderRadius: 2, padding: '1px 2px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontWeight: 600 }}>
                          {ev.title}
                        </div>
                      )
                    })}
                    {dayEvents.length > 2 && (
                      <div style={{ fontSize: '0.48em', color: 'var(--t3)', fontWeight: 600, textAlign: 'center' }}>+{dayEvents.length - 2}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selectedDay && (
        <div className="card">
          <div className="card-t">
            📅 {selectedDay.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
            <button className="ib" style={{ marginLeft: 'auto' }} onClick={() => openModal('event')}>
              ➕ Novo evento
            </button>
          </div>
          {selectedEvents.length === 0 ? (
            <div className="empty-state">Nenhum evento neste dia.</div>
          ) : (
            selectedEvents.map((ev) => {
              const color = isManager && ev.members?.[0] ? (profiles[ev.members[0]]?.color ?? 'var(--mae)') : (profiles[currentProf]?.color ?? 'var(--mae)')
              return (
                <div key={ev.id} className="ti" style={{ gap: 8 }}>
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontWeight: 600, flex: 1 }}>{ev.title}</div>
                  <div className="tt">{ev.time}</div>
                  {ev.recurrenceType && ev.recurrenceType !== 'único' && (
                    <div className="tt">🔁 {ev.recurrenceType}</div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {!selectedDay && (
        <div style={{ marginTop: 8 }}>
          <button className="ib" style={{ width: '100%', textAlign: 'center', padding: 10, fontSize: '0.82em', borderRadius: 10 }} onClick={() => openModal('event')}>
            ➕ Novo evento
          </button>
        </div>
      )}
    </div>
  )
}
