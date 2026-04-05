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

function groupByDate(history) {
  const groups = {}
  history.forEach((item) => {
    const dateKey = item.completedAt ? item.completedAt.slice(0, 10) : 'unknown'
    if (!groups[dateKey]) groups[dateKey] = []
    groups[dateKey].push(item)
  })
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
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
            Nenhuma tarefa concluída no período selecionado.
          </div>
        )}

        {!loading && grouped.map(([dateKey, items]) => (
          <div key={dateKey} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: '0.72em', fontWeight: 700, color: 'var(--mae)', textTransform: 'capitalize', marginBottom: 4, paddingBottom: 4, borderBottom: '1px solid var(--bd)' }}>
              📅 {formatDate(dateKey + 'T12:00:00')}
            </div>
            {items.map((item) => {
              const profile = profiles[item.profileKey]
              return (
                <div key={item.id} className="ti" style={{ gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gn)', flexShrink: 0, marginTop: 1 }} />
                  <div className="tl" style={{ textDecoration: 'none', fontWeight: 600 }}>{item.title}</div>
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
        ))}
      </div>
    </div>
  )
}
