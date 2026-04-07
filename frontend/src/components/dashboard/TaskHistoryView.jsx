import { useEffect, useState, useCallback } from 'react'
import { useAppData } from '../../context/AppDataContext.jsx'

const FILTERS = [
  { label: 'Hoje', value: 'today' },
  { label: 'Esta semana', value: 'week' },
  { label: 'Este mês', value: 'month' },
]

function getDateRange(filter) {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  if (filter === 'today') {
    const today = toISO(now)
    return { from: today + 'T00:00:00.000Z', to: today + 'T23:59:59.999Z' }
  }
  if (filter === 'week') {
    const day = now.getDay()
    const diff = day === 0 ? 6 : day - 1
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - diff)
    return { from: toISO(weekStart) + 'T00:00:00.000Z', to: toISO(now) + 'T23:59:59.999Z' }
  }
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  return { from: toISO(monthStart) + 'T00:00:00.000Z', to: toISO(now) + 'T23:59:59.999Z' }
}

function formatDate(isoString) {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  } catch {
    return isoString
  }
}

function formatTime(isoString) {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

/** Agrupa pelo dia do calendário local (igual ao “fechar o dia” à meia-noite no dispositivo). */
function dayKeyLocal(iso) {
  if (!iso) return 'unknown'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return 'unknown'
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  } catch {
    return 'unknown'
  }
}

function groupByDate(history) {
  const groups = {}
  history.forEach((item) => {
    const dateKey = item.completedAt ? dayKeyLocal(item.completedAt) : 'unknown'
    if (!groups[dateKey]) groups[dateKey] = []
    groups[dateKey].push(item)
  })
  const entries = Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  for (const [, items] of entries) {
    items.sort((a, b) => {
      const am = a.status === 'missed' ? 1 : 0
      const bm = b.status === 'missed' ? 1 : 0
      if (am !== bm) return am - bm
      return (b.completedAt || '').localeCompare(a.completedAt || '')
    })
  }
  return entries
}

export default function TaskHistoryView({ profiles, currentProf }) {
  const { fetchTaskHistory } = useAppData()
  const [filter, setFilter] = useState('week')
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isManager = currentProf === 'gestor'

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const range = getDateRange(filter)
      const result = await fetchTaskHistory(range)
      setHistory(result?.history ?? [])
    } catch (err) {
      setError(err.message || 'Erro ao carregar histórico.')
    } finally {
      setLoading(false)
    }
  }, [filter, fetchTaskHistory])

  useEffect(() => {
    void load()
  }, [load])

  const grouped = groupByDate(history)

  return (
    <div>
      <div className="card" style={{ marginBottom: 8 }}>
        <div className="card-t">📋 Histórico de Tarefas</div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              className={filter === f.value ? 'cb cb-bl' : 'ib'}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
          <button className="ib" style={{ marginLeft: 'auto' }} onClick={load} aria-label="Recarregar">
            🔄
          </button>
        </div>

        {loading && <div className="empty-state">Carregando...</div>}
        {error && <div className="feedback error" style={{ marginBottom: 8 }}>{error}</div>}

        {!loading && history.length === 0 && (
          <div className="empty-state">
            Nenhum registro de tarefa no período (concluídas ou não concluídas).
          </div>
        )}

        {!loading && grouped.map(([dateKey, items]) => {
          const doneCount = items.filter((i) => i.status !== 'missed').length
          const missedCount = items.filter((i) => i.status === 'missed').length
          return (
          <div key={dateKey} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: '0.72em', fontWeight: 700, color: 'var(--brand)', textTransform: 'capitalize', marginBottom: 4, paddingBottom: 4, borderBottom: '1px solid var(--bd)' }}>
              <span>📅 {formatDate(dateKey + 'T12:00:00')}</span>
              <span style={{ display: 'block', fontSize: '0.88em', fontWeight: 600, color: 'var(--t2)', marginTop: 4, textTransform: 'none' }}>
                Dia encerrado: <span style={{ color: '#15803d' }}>{doneCount} concluída{doneCount !== 1 ? 's' : ''}</span>
                {' · '}
                <span style={{ color: missedCount > 0 ? '#b91c1c' : 'var(--t3)' }}>{missedCount} não feita{missedCount !== 1 ? 's' : ''}</span>
              </span>
            </div>
            {items.map((item) => {
              const profile = profiles[item.profileKey]
              const missed = item.status === 'missed'
              return (
                <div key={item.id} className={`ti${missed ? ' task-hist-row-missed' : ''}`} style={{ gap: 8 }}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: missed ? '#dc2626' : 'var(--gn)',
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                    title={missed ? 'Não concluída neste dia' : 'Concluída'}
                  />
                  <div
                    className="tl"
                    style={{
                      textDecoration: 'none',
                      fontWeight: 600,
                      color: missed ? '#b91c1c' : undefined,
                    }}
                  >
                    {item.title}
                  </div>
                  {missed && (
                    <span style={{ fontSize: '0.62em', fontWeight: 800, color: '#b91c1c', flexShrink: 0 }}>Não feita</span>
                  )}
                  {item.reward && (
                    <div className="tp" title="Recompensa">🎁 {item.reward}</div>
                  )}
                  {item.points > 0 && <div className="tp">+{item.points}⭐</div>}
                  {profile && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                      <div className="av" style={{ background: profile.color, width: 16, height: 16, fontSize: '0.45em' }}>
                        {profile.name[0]}
                      </div>
                      {isManager && <span style={{ fontSize: '0.68em', color: 'var(--t3)' }}>{profile.name}</span>}
                    </div>
                  )}
                  <div style={{ fontSize: '0.65em', color: 'var(--t3)', flexShrink: 0 }}>
                    {formatTime(item.completedAt)}
                  </div>
                </div>
              )
            })}
          </div>
          )
        })}
      </div>
    </div>
  )
}
