/** Data local do dispositivo no formato YYYY-MM-DD (para tarefas do dia / rollover). */
export function localCalendarYmd(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
