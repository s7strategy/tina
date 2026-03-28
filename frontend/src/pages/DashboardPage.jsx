import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useAppData } from '../context/AppDataContext.jsx'

const tabItems = [
  { key: 'cal', icon: '📅', label: 'Agenda' },
  { key: 'tasks', icon: '☑️', label: 'Tarefas' },
  { key: 'time', icon: '⏱️', label: 'Tempo' },
  { key: 'rewards', icon: '🌟', label: 'Prêmios' },
  { key: 'meals', icon: '🍴', label: 'Refeições' },
  { key: 'charts', icon: '📈', label: 'Gráficos' },
]

const defaultTaskDraft = { profileKey: 'pedro', title: '', tag: 'Manhã', points: 5 }
const defaultEventDraft = { dayKey: 'qua', title: '', time: '09h', members: ['mae'], cls: 'ce-mae' }
const defaultCategoryDraft = { icon: '📂', name: '', visibility: 'Todos' }
const defaultRewardDraft = { tierId: 'tier-8', value: '' }
const defaultMealDraft = { day: 'Seg', icon: '🍲', name: '', shopping: '', today: false }
const defaultProfileDraft = { name: '', relation: 'Filho(a)', profileType: 'Criança', age: '', color: '#7c6aef' }
const defaultFavoriteDraft = { icon: '⭐', label: '', cat: '💼 Trabalho', sub: '', detail: '' }

function DashboardPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const {
    workspace,
    syncState,
    setCurrentTab,
    setCurrentProf,
    setCurrentView,
    addTask,
    updateTask,
    deleteTask,
    addCategory,
    addCalendarEvent,
    addReward,
    addMeal,
    addProfile,
    addFavorite,
    removeFavorite,
    startFavorite,
    startCustomActivity,
    togglePause,
    stopTimer,
    formatClock,
    formatMinutes,
  } = useAppData()

  const [clock, setClock] = useState(() =>
    new Date().toLocaleString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),
  )
  const [modal, setModal] = useState('')
  const [taskDraft, setTaskDraft] = useState(defaultTaskDraft)
  const [editingTask, setEditingTask] = useState(null)
  const [eventDraft, setEventDraft] = useState(defaultEventDraft)
  const [categoryDraft, setCategoryDraft] = useState(defaultCategoryDraft)
  const [rewardDraft, setRewardDraft] = useState(defaultRewardDraft)
  const [mealDraft, setMealDraft] = useState(defaultMealDraft)
  const [profileDraft, setProfileDraft] = useState(defaultProfileDraft)
  const [favoriteDraft, setFavoriteDraft] = useState(defaultFavoriteDraft)

  const profiles = workspace.profiles
  const currentProfile = profiles[workspace.currentProf] ?? profiles.gestor
  const nonManagerProfiles = Object.values(profiles).filter((profile) => profile.key !== 'gestor')
  const visibleProfiles = useMemo(() => {
    if (user?.role === 'user') {
      return Object.values(profiles).filter((profile) => profile.key !== 'gestor')
    }
    return Object.values(profiles)
  }, [profiles, user?.role])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setClock(
        new Date().toLocaleString('pt-BR', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }),
      )
    }, 60000)

    return () => window.clearInterval(interval)
  }, [])

  function openModal(key) {
    setModal(key)
    if (key === 'task') {
      setTaskDraft((current) => ({ ...defaultTaskDraft, profileKey: workspace.currentProf === 'gestor' ? 'pedro' : workspace.currentProf, ...current }))
    }
  }

  function closeModal() {
    setModal('')
    setEditingTask(null)
    setTaskDraft(defaultTaskDraft)
    setEventDraft(defaultEventDraft)
    setCategoryDraft(defaultCategoryDraft)
    setRewardDraft(defaultRewardDraft)
    setMealDraft(defaultMealDraft)
    setProfileDraft(defaultProfileDraft)
    setFavoriteDraft(defaultFavoriteDraft)
  }

  function todayEvents() {
    const items = workspace.calendar.qua ?? []
    if (workspace.currentProf === 'gestor') return items
    return items.filter((event) => event.members.includes(workspace.currentProf))
  }

  function dayBadgeClass() {
    const count = todayEvents().length
    if (count >= 4) return 'cheio'
    if (count >= 2) return 'moderado'
    return 'tranquilo'
  }

  function dayBadgeLabel() {
    const count = todayEvents().length
    if (count >= 4) return '📌 Dia cheio'
    if (count >= 2) return '📌 Dia moderado'
    return '📌 Dia tranquilo'
  }

  function memberNames(memberKeys) {
    return memberKeys.map((key) => profiles[key]?.name ?? key).join(' · ')
  }

  async function submitTask(event) {
    event.preventDefault()
    if (!taskDraft.title.trim()) return

    if (editingTask) {
      await updateTask(taskDraft.profileKey, editingTask.id, {
        title: taskDraft.title,
        tag: taskDraft.tag,
        points: Number(taskDraft.points) || 0,
      })
    } else {
      await addTask(taskDraft)
    }

    closeModal()
  }

  async function toggleTaskState(profileKey, task) {
    await updateTask(profileKey, task.id, { done: !task.done })
  }

  async function submitCategory(event) {
    event.preventDefault()
    if (!categoryDraft.name.trim()) return

    await addCategory({
      profileKey: workspace.currentProf === 'gestor' ? 'mae' : workspace.currentProf,
      ...categoryDraft,
    })

    closeModal()
  }

  function submitEvent(event) {
    event.preventDefault()
    if (!eventDraft.title.trim()) return
    addCalendarEvent(eventDraft)
    closeModal()
  }

  function submitReward(event) {
    event.preventDefault()
    if (!rewardDraft.value.trim()) return
    addReward(rewardDraft)
    closeModal()
  }

  function submitMeal(event) {
    event.preventDefault()
    if (!mealDraft.name.trim()) return
    addMeal(mealDraft)
    closeModal()
  }

  function submitProfile(event) {
    event.preventDefault()
    if (!profileDraft.name.trim()) return

    const key = `${profileDraft.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-')}-${Date.now()}`
    addProfile({
      key,
      name: profileDraft.name,
      short: '0/0 tarefas',
      color: profileDraft.color,
      avatar: profileDraft.name[0]?.toUpperCase() ?? 'P',
      type: 'member',
      statusColor: '#22c55e',
      relation: profileDraft.relation,
      profileType: profileDraft.profileType,
      age: profileDraft.age,
      tasks: [],
      categories: [],
      favorites: [],
      workSubs: [],
      tracking: {
        active: false,
        paused: false,
        cat: '🏠 Casa',
        sub: '',
        detail: '',
        seconds: 0,
        totalMinutes: 0,
        log: [],
      },
    })
    closeModal()
  }

  function submitFavorite(event) {
    event.preventDefault()
    if (!favoriteDraft.label.trim()) return
    addFavorite(workspace.currentProf, favoriteDraft)
    closeModal()
  }

  function editTask(profileKey, task) {
    setEditingTask(task)
    setTaskDraft({
      profileKey,
      title: task.title,
      tag: task.tag,
      points: task.points,
    })
    setModal('task')
  }

  function switchToProfile(key) {
    setCurrentProf(key)
  }

  function renderCalendarView() {
    const isManager = workspace.currentProf === 'gestor'
    const profile = profiles[workspace.currentProf]
    const renderEvents = (events) => {
      if (isManager) return events
      return events.filter((item) => item.members.includes(workspace.currentProf))
    }

    const todaysEvents = renderEvents(workspace.calendar.qua ?? [])

    return (
      <>
        {isManager ? (
          <div className="mbars">
            {['mae', 'pai', 'pedro', 'sofia', 'vovo'].filter((key) => profiles[key]).map((key) => (
              <div className="mb" style={{ background: profiles[key].color }} key={key}>
                ● {profiles[key].name}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, padding: '4px 0' }}>
            <div className="av" style={{ background: profile.color, width: 24, height: 24, fontSize: '0.6em' }}>
              {profile.name[0]}
            </div>
            <span style={{ fontFamily: "'Plus Jakarta Sans'", fontWeight: 700, fontSize: '0.85em' }}>
              Agenda de {profile.name}
            </span>
          </div>
        )}

        {todaysEvents.length > 0 ? (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 12px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontFamily: "'Plus Jakarta Sans'", fontWeight: 800, fontSize: '0.9em' }}>HOJE 🌤️</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.72em', color: '#92400e', fontWeight: 700 }}>
                {dayBadgeLabel()}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {todaysEvents.map((item) => (
                <div
                  className={`ce ${isManager ? item.cls : ''}`}
                  key={item.id}
                  style={!isManager ? { fontSize: '0.68em', padding: '5px 8px', borderRadius: 8, background: `${profile.color}15`, borderLeftColor: profile.color } : { fontSize: '0.68em', padding: '5px 8px', borderRadius: 8 }}
                >
                  <span className="ce-t">{item.title}</span> <span className="ce-m">{item.time}</span>
                  {isManager ? (
                    <div style={{ fontSize: '0.85em', color: 'var(--t3)', marginTop: 1 }}>{memberNames(item.members)}</div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="cg">
          {workspace.weekDays.filter((day) => !day.today).map((day) => {
            const events = renderEvents(workspace.calendar[day.key] ?? [])
            return (
              <div className="cd" key={day.key}>
                <div className="cd-h">
                  <span className="cd-n">{day.name}</span>
                  <span className="cd-d">{day.num}</span>
                </div>
                <div className="cd-c">
                  {events.length} evento{events.length !== 1 ? 's' : ''}
                </div>
                {events.map((item) => (
                  <div
                    className={`ce ${isManager ? item.cls : ''}`}
                    key={item.id}
                    style={!isManager ? { background: `${profile.color}15`, borderLeftColor: profile.color } : undefined}
                  >
                    <span className="ce-t">{item.title}</span> <span className="ce-m">{item.time}</span>
                    {isManager ? (
                      <div style={{ fontSize: '0.85em', color: 'var(--t3)', marginTop: 1 }}>{memberNames(item.members)}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            )
          })}

          <div className="cd" style={{ background: 'var(--bg)' }}>
            <div className="cd-h">
              <span className="cd-n">Próx. Semana</span>
            </div>
            <div className="cd-c" style={{ fontSize: '0.62em' }}>
              31 Mar–6 Abr
            </div>
            <div style={{ fontSize: '0.58em', color: 'var(--t3)', marginTop: 4 }}>
              🏥 Dentista · 🎂 Aniv. Vovó · 📝 Prova
            </div>
          </div>

          {isManager ? (
            <div className="cd" style={{ background: 'var(--bg)', border: 'none' }}>
              <div style={{ fontSize: '0.65em', fontWeight: 700, color: 'var(--t2)', marginBottom: 6 }}>Tarefas Hoje</div>
              {nonManagerProfiles.map((profileItem) => {
                const total = profileItem.tasks?.length || 1
                const done = profileItem.tasks?.filter((task) => task.done).length || 0
                const pct = Math.round((done / total) * 100)
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3, fontSize: '0.65em' }} key={`progress-${profileItem.key}`}>
                    <span style={{ color: profileItem.color, fontWeight: 700 }}>{profileItem.name}</span>
                    <div style={{ flex: 1, height: 6, background: '#e8e5e0', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: profileItem.color, borderRadius: 3 }}></div>
                    </div>
                    <span style={{ fontWeight: 700 }}>
                      {done}/{total}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: 10 }}>
          <button className="ib" style={{ width: '100%', textAlign: 'center', padding: 10, fontSize: '0.82em', borderRadius: 10 }} onClick={() => openModal('event')}>
            ➕ Novo evento
          </button>
        </div>
      </>
    )
  }

  function renderTasksView() {
    const isManager = workspace.currentProf === 'gestor'
    const targetProfiles = isManager ? nonManagerProfiles : [currentProfile]

    return (
      <div className={isManager ? 'g2' : ''}>
        {targetProfiles.map((profile) => {
          const done = profile.tasks?.filter((task) => task.done).length ?? 0
          return (
            <div className="card" key={profile.key}>
              <div className="card-t" style={{ color: profile.color }}>
                <div className="av" style={{ background: profile.color, width: 22, height: 22, fontSize: '0.55em' }}>
                  {profile.name[0]}
                </div>
                {isManager ? `${profile.name} — ${done}/${profile.tasks.length}` : `✅ Minhas Tarefas — ${done}/${profile.tasks.length}`}
                {profile.stars ? ` · ⭐${profile.stars}` : ''}
                {profile.streak ? ` · 🔥${profile.streak}d` : ''}
              </div>
              {profile.tasks.map((task) => (
                <div className="ti" key={task.id}>
                  <button className={`ck${task.done ? ' d' : ''}`} onClick={() => toggleTaskState(profile.key, task)}>
                    {task.done ? '✓' : ''}
                  </button>
                  <div className={`tl${task.done ? ' d' : ''}`}>{task.title}</div>
                  {task.points ? <div className="tp">+{task.points}⭐</div> : null}
                  <div className="tt">{task.tag}</div>
                  <button className="ib" onClick={() => editTask(profile.key, task)}>
                    ✏️
                  </button>
                  <button className="ib" onClick={() => deleteTask(profile.key, task.id)}>
                    ✕
                  </button>
                </div>
              ))}
              <div style={{ marginTop: 6, display: 'flex', gap: 3 }}>
                <button
                  className="ib"
                  onClick={() => {
                    setTaskDraft({ ...defaultTaskDraft, profileKey: profile.key })
                    openModal('task')
                  }}
                >
                  ➕ Tarefa
                </button>
                <button className="ib" onClick={() => openModal('category')}>
                  📂 Categorias
                </button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  function renderManagerTime() {
    return (
      <>
        <div style={{ fontFamily: "'Plus Jakarta Sans'", fontWeight: 800, fontSize: '0.95em', marginBottom: 10 }}>
          ⏱️ Visão Geral — Família
        </div>
        <div className="g2" style={{ marginBottom: 10 }}>
          {nonManagerProfiles.map((profile) => {
            const tracking = profile.tracking
            const isPaused = tracking.paused
            const statusBg = tracking.active && !isPaused ? '#dcfce7' : isPaused ? '#fef3c7' : '#f3f3f3'
            const statusFg = tracking.active && !isPaused ? '#16a34a' : isPaused ? '#d97706' : '#999'
            const statusLabel = tracking.active && !isPaused ? '● Ativo' : isPaused ? '⏸ Pausado' : '○ Idle'
            return (
              <div className="gt" key={profile.key}>
                <div className="gt-h">
                  <div className="gt-av" style={{ background: profile.color }}>{profile.name[0]}</div>
                  <div className="gt-nm">{profile.name}</div>
                  <span className="gt-st" style={{ background: statusBg, color: statusFg }}>{statusLabel}</span>
                </div>
                <div className="gt-task">
                  {tracking.cat}
                  {tracking.sub ? ` → ${tracking.sub}` : ''}
                </div>
                <div className="gt-tmr" style={{ color: profile.color }}>
                  {formatClock(tracking.seconds)}
                </div>
                <div className="gt-tot">Hoje: {formatMinutes(tracking.totalMinutes)}</div>
              </div>
            )
          })}
        </div>
        <div className="card">
          <div className="card-t">🏆 Quem mais focou hoje</div>
          {nonManagerProfiles.map((profile) => {
            const pct = Math.max(8, Math.round((profile.tracking.totalMinutes / 480) * 100))
            return (
              <div className="pb" key={`focus-${profile.key}`}>
                <span className="pb-l" style={{ color: profile.color }}>{profile.name}</span>
                <div className="pb-b">
                  <div className="pb-f" style={{ width: `${pct}%`, background: profile.color }}></div>
                </div>
                <span className="pb-v" style={{ color: profile.color }}>{formatMinutes(profile.tracking.totalMinutes)}</span>
              </div>
            )
          })}
        </div>
      </>
    )
  }

  function renderPersonalTime(profile) {
    const tracking = profile.tracking
    const isActive = tracking.active && !tracking.paused
    const categories = profile.categories ?? []
    const favorites = profile.favorites ?? []
    const chartSegments = [
      { label: 'Categoria atual', width: 44, color: profile.color, text: `${tracking.cat} ${formatMinutes(Math.floor(tracking.seconds / 60))}` },
      { label: 'Total hoje', width: 56, color: 'var(--bd)', text: `Total ${formatMinutes(tracking.totalMinutes)}` },
    ]

    return (
      <>
        <div style={{ background: 'linear-gradient(135deg,#1a1530,#2d2548)', borderRadius: 16, padding: '24px 16px', textAlign: 'center', marginBottom: 10, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 40%,rgba(124,106,239,0.08),transparent 70%)' }}></div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: '0.78em', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
              {isActive ? 'Rastreando agora' : tracking.paused ? 'Pausado' : 'Pronto para iniciar'}
            </div>
            <div style={{ width: 160, height: 160, margin: '12px auto', position: 'relative' }}>
              <svg width="160" height="160" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
                <circle
                  cx="80"
                  cy="80"
                  r="70"
                  fill="none"
                  stroke={isActive ? profile.color : '#f59e0b'}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${isActive ? 310 : 200} 440`}
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontFamily: "'Plus Jakarta Sans'", fontSize: '2.2em', fontWeight: 800, color: 'white', letterSpacing: '-0.02em' }}>
                  {formatClock(tracking.seconds)}
                </div>
                <div style={{ fontSize: '0.72em', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
                  {tracking.cat}
                  {tracking.sub ? ` → ${tracking.sub}` : ''}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 8 }}>
              <button
                onClick={() => togglePause(profile.key)}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  border: 'none',
                  background: isActive ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.2)',
                  color: isActive ? '#fbbf24' : '#22c55e',
                  fontSize: '1.5em',
                  cursor: 'pointer',
                }}
              >
                {isActive ? '⏸' : '▶️'}
              </button>
              <button
                onClick={() => stopTimer(profile.key)}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  border: 'none',
                  background: 'rgba(239,68,68,0.15)',
                  color: '#f87171',
                  fontSize: '1.3em',
                  cursor: 'pointer',
                }}
              >
                ⏹
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-t">
            ⚡ Favoritos de {profile.name}
            <button className="ib" style={{ marginLeft: 'auto' }} onClick={() => openModal('manage-fav')}>
              ⭐ Gerenciar
            </button>
          </div>
          {favorites.length === 0 ? (
            <div className="empty-state">Nenhum favorito ainda.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
              {favorites.map((favorite) => {
                const favoriteActive = tracking.active && tracking.cat === favorite.cat && (tracking.sub || '') === (favorite.sub || '')
                return (
                  <div
                    key={favorite.id}
                    onClick={() => startFavorite(profile.key, favorite.id)}
                    style={{
                      background: 'var(--bg)',
                      borderRadius: 10,
                      padding: '10px 6px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      border: favoriteActive ? `2px solid ${profile.color}` : '2px solid transparent',
                      position: 'relative',
                    }}
                  >
                    <div style={{ fontSize: '1.3em' }}>{favorite.icon}</div>
                    <div style={{ fontSize: '0.68em', fontWeight: 700, marginTop: 2 }}>{favorite.label}</div>
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        removeFavorite(profile.key, favorite.id)
                      }}
                      style={{ position: 'absolute', top: 2, left: 2, background: 'none', border: 'none', fontSize: '0.55em', cursor: 'pointer', opacity: 0.35, padding: 2 }}
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
              <div onClick={() => openModal('add-fav')} style={{ background: 'transparent', border: '1.5px dashed var(--bd)', borderRadius: 10, padding: '10px 6px', textAlign: 'center', cursor: 'pointer' }}>
                <div style={{ fontSize: '1.3em', color: 'var(--t3)' }}>➕</div>
                <div style={{ fontSize: '0.68em', fontWeight: 700, color: 'var(--t3)', marginTop: 2 }}>Adicionar</div>
              </div>
            </div>
          )}

          {categories.length > 0 ? (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--bd)' }}>
              <div style={{ fontSize: '0.62em', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', marginBottom: 4 }}>
                Categorias
              </div>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {categories.map((category) => (
                  <button
                    className="ib"
                    key={category.id}
                    onClick={() =>
                      startCustomActivity(profile.key, {
                        cat: `${category.icon} ${category.name}`,
                        sub: '',
                        detail: '',
                      })
                    }
                  >
                    {category.icon} {category.name}
                  </button>
                ))}
                <button className="ib" onClick={() => openModal('category')}>
                  ➕ Nova Categoria
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="card">
          <div className="card-t">📋 Linha do Tempo — Hoje</div>
          {tracking.log.length > 0 ? (
            <>
              {tracking.log.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 0',
                    borderBottom: '1px solid var(--bd)',
                    ...(entry.active
                      ? {
                          background: '#f0f9ff',
                          borderRadius: 6,
                          padding: '6px 8px',
                          border: 'none',
                          marginBottom: 2,
                        }
                      : {}),
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: entry.active ? 'var(--gn)' : profile.color, flexShrink: 0 }}></div>
                  <div style={{ flex: 1, fontSize: '0.78em', fontWeight: 600 }}>{entry.name}</div>
                  <div style={{ fontSize: '0.72em', color: 'var(--t3)', flexShrink: 0 }}>{entry.time}</div>
                  <div style={{ fontFamily: "'Plus Jakarta Sans'", fontSize: '0.78em', fontWeight: 700, flexShrink: 0, width: 42, textAlign: 'right' }}>
                    {formatMinutes(entry.durationMinutes)}
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '2px solid var(--bd)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8em', fontWeight: 700 }}>Total Hoje</span>
                <span style={{ fontFamily: "'Plus Jakarta Sans'", fontWeight: 800, fontSize: '1.1em', color: profile.color }}>
                  {formatMinutes(profile.tracking.totalMinutes)}
                </span>
              </div>
            </>
          ) : (
            <div className="empty-state">Nenhuma atividade registrada hoje.</div>
          )}
        </div>

        <div className="card">
          <div className="card-t">📊 Distribuição do Dia</div>
          <div style={{ display: 'flex', height: 18, borderRadius: 9, overflow: 'hidden', gap: 1 }}>
            {chartSegments.map((segment) => (
              <div key={segment.label} style={{ width: `${segment.width}%`, background: segment.color }} title={segment.text}></div>
            ))}
          </div>
        </div>
      </>
    )
  }

  function renderRewardsView() {
    return workspace.rewards.map((tier) => (
      <div className="card" key={tier.id}>
        <div className="card-t" style={{ color: tier.color }}>
          {tier.label} (⭐{tier.cost})
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
            <button
              className="ib"
              onClick={() => {
                setRewardDraft({ tierId: tier.id, value: '' })
                openModal('reward')
              }}
            >
              ➕ Criar
            </button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
          {tier.items.map((item) => (
            <div className="rw" key={`${tier.id}-${item}`}>
              <div className="rw-i">{item.split(' ')[0]}</div>
              <div className="rw-n">{item.slice(2)}</div>
              <div className="rw-c" style={{ color: tier.color }}>
                ⭐{tier.cost}
              </div>
            </div>
          ))}
          <div className="rw rw-add" onClick={() => {
            setRewardDraft({ tierId: tier.id, value: '' })
            openModal('reward')
          }}>
            <div style={{ fontSize: '1.2em', color: 'var(--t3)' }}>➕</div>
            <div className="rw-n" style={{ color: 'var(--t3)' }}>Criar</div>
          </div>
        </div>
      </div>
    ))
  }

  function renderMealsView() {
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
          {workspace.meals.map((meal) => (
            <div className="ml" style={meal.today ? { border: '2px solid var(--mae)' } : undefined} key={meal.id}>
              <div className="ml-d" style={meal.today ? { color: 'var(--mae)' } : undefined}>
                {meal.day}
              </div>
              <div className="ml-i">{meal.icon}</div>
              <div className="ml-n">{meal.name}</div>
              {meal.shopping ? <div className="ml-m">🛒 {meal.shopping}</div> : null}
            </div>
          ))}
          <div className="ml" style={{ border: '1.5px dashed var(--bd)' }}>
            <div className="ml-d">🛒 Lista</div>
            <div className="ml-i">📝</div>
            <div className="ml-n" style={{ color: 'var(--sof)' }}>
              {workspace.shoppingListCount} itens
            </div>
          </div>
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 3 }}>
          <button className="ib" onClick={() => openModal('meal')}>
            ➕ Adicionar refeição
          </button>
        </div>
      </>
    )
  }

  function renderChartsView() {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 30 }}>
        <div style={{ fontSize: '2em' }}>📊</div>
        <div style={{ fontFamily: "'Plus Jakarta Sans'", fontWeight: 800, marginTop: 8 }}>
          Gráficos detalhados
        </div>
        <div style={{ color: 'var(--t3)', fontSize: '0.85em', marginTop: 4 }}>
          Base pronta para evoluir semanal, mensal, por pessoa e por categoria.
        </div>
      </div>
    )
  }

  function renderContent() {
    if (workspace.currentTab === 'cal') return renderCalendarView()
    if (workspace.currentTab === 'tasks') return renderTasksView()
    if (workspace.currentTab === 'time') return workspace.currentProf === 'gestor' ? renderManagerTime() : renderPersonalTime(currentProfile)
    if (workspace.currentTab === 'rewards') return renderRewardsView()
    if (workspace.currentTab === 'meals') return renderMealsView()
    return renderChartsView()
  }

  const settingsProfile = workspace.currentProf === 'gestor' ? nonManagerProfiles[0] : currentProfile

  return (
    <>
      <div className="app">
        <div className="sb">
          <div className="sb-logo">🏠</div>
          {tabItems.map((item) => (
            <button key={item.key} className={`si${workspace.currentTab === item.key ? ' on' : ''}`} onClick={() => setCurrentTab(item.key)}>
              <span className="ic">{item.icon}</span>
              <span className="lb">{item.label}</span>
            </button>
          ))}
          <div className="sb-sp"></div>
          <button className="si" onClick={() => openModal('settings')}>
            <span className="ic">⚙️</span>
            <span className="lb">Config</span>
          </button>
        </div>

        <div className="mn">
          <div className="top-wrap">
            <div className="top-row1">
              <div className="wt">
                <span className="wt-ic">🌤️</span>
                <div>
                  <div className="wt-t">28°C</div>
                  <div className="wt-d">{clock}</div>
                </div>
              </div>
              <div className={`day-badge ${dayBadgeClass()}`}>{dayBadgeLabel()}</div>
            </div>

            <div className="top-row2">
              {visibleProfiles.map((profile) => {
                const done = profile.tasks?.filter((task) => task.done).length ?? 0
                const total = profile.tasks?.length ?? 0
                return (
                  <div
                    className={`pf${workspace.currentProf === profile.key ? ' on' : ''}`}
                    data-m={profile.key}
                    key={profile.key}
                    onClick={() => switchToProfile(profile.key)}
                    style={profile.key === 'vovo' ? { opacity: 0.7 } : undefined}
                  >
                    <div
                      className="av"
                      style={
                        profile.avatarUrl
                          ? { backgroundImage: `url('${profile.avatarUrl}')`, backgroundSize: 'cover' }
                          : { background: `linear-gradient(135deg,${profile.color},#666)` }
                      }
                    >
                      {!profile.avatarUrl ? profile.avatar ?? profile.name[0] : <span style={{ display: 'none' }}>{profile.name[0]}</span>}
                    </div>
                    <div className="pf-info">
                      <div className="pf-n">
                        {profile.name}
                        {profile.statusColor ? <div className="pf-dot" style={{ background: profile.statusColor }}></div> : null}
                      </div>
                      <div className="pf-s">
                        {profile.short ?? `${done}/${total} tarefas`}
                      </div>
                    </div>
                  </div>
                )
              })}
              {user?.role !== 'user' ? (
                <button className="add-person" onClick={() => openModal('add-person')}>
                  +
                </button>
              ) : null}
            </div>

            <div className="top-row3">
              <div className="date-nav">
                <div className="ar">‹</div>
                <span className="rng">{workspace.weekRange}</span>
                <div className="ar">›</div>
              </div>
              <div className="date-vt">
                {['Semanal', 'Mensal'].map((view) => (
                  <button
                    key={view}
                    className={workspace.currentView === view ? 'on' : ''}
                    onClick={() => setCurrentView(view)}
                  >
                    {view}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="ct" id="content-area">
            {syncState.error ? <div className="feedback error">{syncState.error}</div> : null}
            {renderContent()}
          </div>
        </div>
      </div>

      <Modal isOpen={modal === 'task'} id="modal-task" onClose={closeModal} title={editingTask ? '✏️ Editar Tarefa' : '➕ Nova Tarefa'}>
        <form onSubmit={submitTask}>
          <select className="sel" value={taskDraft.profileKey} onChange={(event) => setTaskDraft((current) => ({ ...current, profileKey: event.target.value }))}>
            {nonManagerProfiles.map((profile) => (
              <option value={profile.key} key={profile.key}>
                {profile.name}
              </option>
            ))}
          </select>
          <input placeholder="Nome da tarefa" value={taskDraft.title} onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))} />
          <select className="sel" value={taskDraft.tag} onChange={(event) => setTaskDraft((current) => ({ ...current, tag: event.target.value }))}>
            <option>Manhã</option>
            <option>Tarde</option>
            <option>Noite</option>
            <option>Qualquer horário</option>
          </select>
          <input type="number" placeholder="Pontos / estrelas" value={taskDraft.points} onChange={(event) => setTaskDraft((current) => ({ ...current, points: event.target.value }))} />
          <button className="save-btn" type="submit">
            {editingTask ? 'Salvar alterações' : 'Salvar Tarefa'}
          </button>
        </form>
      </Modal>

      <Modal isOpen={modal === 'event'} id="modal-event" onClose={closeModal} title="📅 Novo Evento">
        <form onSubmit={submitEvent}>
          <input placeholder="Nome do evento" value={eventDraft.title} onChange={(event) => setEventDraft((current) => ({ ...current, title: event.target.value }))} />
          <select className="sel" value={eventDraft.dayKey} onChange={(event) => setEventDraft((current) => ({ ...current, dayKey: event.target.value }))}>
            {workspace.weekDays.map((day) => (
              <option value={day.key} key={day.key}>
                {day.name}
              </option>
            ))}
          </select>
          <input placeholder="Horário" value={eventDraft.time} onChange={(event) => setEventDraft((current) => ({ ...current, time: event.target.value }))} />
          <div style={{ fontSize: '0.68em', fontWeight: 700, color: 'var(--t3)', margin: '8px 0 3px' }}>👤 Quem participa:</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
            {nonManagerProfiles.map((profile) => (
              <button
                type="button"
                className={`day-btn${eventDraft.members.includes(profile.key) ? ' on' : ''}`}
                key={profile.key}
                onClick={() =>
                  setEventDraft((current) => ({
                    ...current,
                    members: current.members.includes(profile.key)
                      ? current.members.filter((item) => item !== profile.key)
                      : [...current.members, profile.key],
                  }))
                }
              >
                {profile.name}
              </button>
            ))}
          </div>
          <button className="save-btn" type="submit">
            Salvar Evento
          </button>
        </form>
      </Modal>

      <Modal isOpen={modal === 'category'} id="modal-new-cat" onClose={closeModal} title="📂 Nova Categoria">
        <form onSubmit={submitCategory}>
          <input placeholder="Emoji" value={categoryDraft.icon} onChange={(event) => setCategoryDraft((current) => ({ ...current, icon: event.target.value }))} />
          <input placeholder="Nome da categoria" value={categoryDraft.name} onChange={(event) => setCategoryDraft((current) => ({ ...current, name: event.target.value }))} />
          <select className="sel" value={categoryDraft.visibility} onChange={(event) => setCategoryDraft((current) => ({ ...current, visibility: event.target.value }))}>
            <option>Todos</option>
            {nonManagerProfiles.map((profile) => (
              <option key={profile.key}>{profile.name}</option>
            ))}
          </select>
          <button className="save-btn" type="submit">
            Criar Categoria
          </button>
        </form>
      </Modal>

      <Modal isOpen={modal === 'reward'} id="modal-reward" onClose={closeModal} title="🎁 Nova Recompensa">
        <form onSubmit={submitReward}>
          <select className="sel" value={rewardDraft.tierId} onChange={(event) => setRewardDraft((current) => ({ ...current, tierId: event.target.value }))}>
            {workspace.rewards.map((tier) => (
              <option value={tier.id} key={tier.id}>
                {tier.label}
              </option>
            ))}
          </select>
          <input placeholder="Nome da recompensa (com emoji)" value={rewardDraft.value} onChange={(event) => setRewardDraft((current) => ({ ...current, value: event.target.value }))} />
          <button className="save-btn" type="submit">
            Salvar Recompensa
          </button>
        </form>
      </Modal>

      <Modal isOpen={modal === 'meal'} id="modal-meal" onClose={closeModal} title="🍽️ Nova Refeição">
        <form onSubmit={submitMeal}>
          <input placeholder="Dia" value={mealDraft.day} onChange={(event) => setMealDraft((current) => ({ ...current, day: event.target.value }))} />
          <input placeholder="Emoji" value={mealDraft.icon} onChange={(event) => setMealDraft((current) => ({ ...current, icon: event.target.value }))} />
          <input placeholder="Nome da refeição" value={mealDraft.name} onChange={(event) => setMealDraft((current) => ({ ...current, name: event.target.value }))} />
          <input placeholder="Lista de compras (opcional)" value={mealDraft.shopping} onChange={(event) => setMealDraft((current) => ({ ...current, shopping: event.target.value }))} />
          <button className="save-btn" type="submit">
            Salvar refeição
          </button>
        </form>
      </Modal>

      <Modal isOpen={modal === 'add-person'} id="modal-add-person" onClose={closeModal} title="👤 Adicionar Pessoa">
        <form onSubmit={submitProfile}>
          <input placeholder="Nome" value={profileDraft.name} onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))} />
          <select className="sel" value={profileDraft.relation} onChange={(event) => setProfileDraft((current) => ({ ...current, relation: event.target.value }))}>
            <option>Mãe</option>
            <option>Pai</option>
            <option>Filho(a)</option>
            <option>Avô/Avó</option>
            <option>Outro</option>
          </select>
          <select className="sel" value={profileDraft.profileType} onChange={(event) => setProfileDraft((current) => ({ ...current, profileType: event.target.value }))}>
            <option>Adulto (gerencia tarefas)</option>
            <option>Criança (recebe tarefas + estrelas)</option>
            <option>Observador (só visualiza)</option>
          </select>
          <input placeholder="Idade (opcional)" value={profileDraft.age} onChange={(event) => setProfileDraft((current) => ({ ...current, age: event.target.value }))} />
          <input placeholder="Cor do perfil" value={profileDraft.color} onChange={(event) => setProfileDraft((current) => ({ ...current, color: event.target.value }))} />
          <button className="save-btn" type="submit">
            Adicionar à Família
          </button>
        </form>
      </Modal>

      <Modal isOpen={modal === 'add-fav'} id="modal-add-fav" onClose={closeModal} title="⭐ Novo Favorito">
        <form onSubmit={submitFavorite}>
          <input placeholder="Emoji" value={favoriteDraft.icon} onChange={(event) => setFavoriteDraft((current) => ({ ...current, icon: event.target.value }))} />
          <input placeholder="Nome curto" value={favoriteDraft.label} onChange={(event) => setFavoriteDraft((current) => ({ ...current, label: event.target.value }))} />
          <input placeholder="Categoria" value={favoriteDraft.cat} onChange={(event) => setFavoriteDraft((current) => ({ ...current, cat: event.target.value }))} />
          <input placeholder="Subcategoria" value={favoriteDraft.sub} onChange={(event) => setFavoriteDraft((current) => ({ ...current, sub: event.target.value }))} />
          <input placeholder="Detalhe" value={favoriteDraft.detail} onChange={(event) => setFavoriteDraft((current) => ({ ...current, detail: event.target.value }))} />
          <button className="save-btn" type="submit">
            Adicionar Favorito
          </button>
        </form>
      </Modal>

      <Modal isOpen={modal === 'manage-fav'} id="modal-manage-fav" onClose={closeModal} title="⭐ Gerenciar Favoritos">
        <div style={{ fontSize: '0.78em', color: 'var(--t3)', marginBottom: 10 }}>
          Remova ou revise os atalhos rápidos do perfil atual.
        </div>
        {(settingsProfile?.favorites ?? []).length > 0 ? (
          settingsProfile.favorites.map((favorite) => (
            <div key={favorite.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--bd)', fontSize: '0.85em' }}>
              <span style={{ fontSize: '1.2em' }}>{favorite.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{favorite.label}</div>
                <div style={{ fontSize: '0.78em', color: 'var(--t3)' }}>
                  {favorite.cat}
                  {favorite.sub ? ` → ${favorite.sub}` : ''}
                </div>
              </div>
              <button className="ib" onClick={() => removeFavorite(settingsProfile.key, favorite.id)}>
                ✕ Remover
              </button>
            </div>
          ))
        ) : (
          <div className="empty-state">Nenhum favorito ainda.</div>
        )}
      </Modal>

      <Modal isOpen={modal === 'settings'} id="modal-settings" onClose={closeModal} title="⚙️ Configurações">
        <div style={{ fontSize: '0.82em' }}>
          <div className="ti">
            <span className="tl">👥 Perfis locais</span>
            <button className="ib" onClick={() => openModal('add-person')}>
              Editar
            </button>
          </div>
          <div className="ti">
            <span className="tl">📂 Categorias</span>
            <button className="ib" onClick={() => openModal('category')}>
              Editar
            </button>
          </div>
          <div className="ti">
            <span className="tl">🔌 Sincronização com backend</span>
            <span className="tt">{syncState.loading ? 'Sincronizando' : 'Ativo'}</span>
          </div>
          <div className="ti">
            <span className="tl">🔐 Papel atual</span>
            <span className="tt">{user?.role}</span>
          </div>
          {user?.role === 'super_admin' ? (
            <div className="ti">
              <span className="tl">🏢 Painel do super admin</span>
              <button className="ib" onClick={() => navigate('/super-admin')}>
                Abrir
              </button>
            </div>
          ) : null}
          <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
            <button className="ib" onClick={() => logout()}>
              Sair
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}

function Modal({ isOpen, id, onClose, title, children }) {
  return (
    <div className={`modal-bg${isOpen ? ' on' : ''}`} id={id} onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal">
        <button className="modal-close" onClick={onClose}>
          ✕
        </button>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  )
}

export default DashboardPage
