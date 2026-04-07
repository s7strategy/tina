import { localCalendarYmd } from './localDate.js'

/**
 * Semana (seg–dom) alinhada ao backend `generateCurrentWeek`, com deslocamento em semanas.
 * `fullDate` usa calendário local do dispositivo — nunca `toISOString()` (isso usa UTC e falha no Brasil).
 */
export function generateWeekDays(weekOffset = 0) {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1

  const monday = new Date(now)
  monday.setDate(now.getDate() - diffToMonday + weekOffset * 7)
  monday.setHours(0, 0, 0, 0)

  const keys = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']
  const names = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

  const week = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    week.push({
      key: keys[i],
      name: names[i],
      num: String(d.getDate()).padStart(2, '0'),
      today:
        d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(),
      fullDate: localCalendarYmd(d),
    })
  }
  return week
}

export function formatWeekRange(weekDays) {
  if (!weekDays?.length) return ''
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const firstDay = weekDays[0]
  const lastDay = weekDays[6]
  const m0 = new Date(firstDay.fullDate + 'T12:00:00').getMonth()
  const m1 = new Date(lastDay.fullDate + 'T12:00:00').getMonth()
  const monthStart = months[m0]
  const monthEnd = months[m1]
  return `${firstDay.num} ${monthStart !== monthEnd ? monthStart + ' ' : ''}— ${lastDay.num} ${monthEnd}`
}

/** Mesma lógica que `backend/src/lib/workspace.js` para filtrar eventos num dia. */
export function eventsForDay(rawEvents, day) {
  if (!rawEvents?.length) return []
  return rawEvents
    .filter((event) => {
      if (event.event_date === day.fullDate) return true
      if (event.day_key === day.key && (!event.recurrence_type || event.recurrence_type === 'único' || event.recurrence_type === '')) return true
      if (event.recurrence_type === 'diária') return true
      if (['semanal', 'quinzenal'].includes(event.recurrence_type) && event.recurrence_days && event.recurrence_days.includes(day.key)) return true
      if (event.recurrence_type === 'mensal' && event.event_date) {
        return Number(event.event_date.split('-')[2]) === Number(day.num)
      }
      return false
    })
    .map((event) => {
      let members = []
      try {
        members = JSON.parse(event.member_keys_json || '[]')
      } catch {
        members = []
      }
      return {
        id: event.id,
        title: event.title,
        time: event.time,
        cls: event.cls,
        members,
        isForEveryone: members.includes('Todos'),
      }
    })
}
