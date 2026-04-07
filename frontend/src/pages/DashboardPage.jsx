import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { CloudSun, Pin, Plus } from 'lucide-react'
import { useWeather } from '../hooks/useWeather.js'
import WeatherModal from '../components/ui/WeatherModal.jsx'
import WeatherLucideIcon from '../components/ui/WeatherLucideIcon.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useAppData } from '../context/AppDataContext.jsx'
import { useUiMode } from '../context/UiModeContext.jsx'
import TabletShell from '../shell/TabletShell.jsx'
import MobileShell from '../shell/MobileShell.jsx'
import Modal from '../components/ui/Modal.jsx'
import AvatarCropModal from '../components/ui/AvatarCropModal.jsx'
import ErrorBoundary from '../components/ui/ErrorBoundary.jsx'
import AppLoadingScreen from '../components/ui/AppLoadingScreen.jsx'
import PeoplePicker from '../components/ui/PeoplePicker.jsx'
import EmojiPicker from '../components/ui/EmojiPicker.jsx'
import { FavOrCatIcon } from '../components/ui/FavOrCatIcon.jsx'
import IconUploadRow from '../components/ui/IconUploadRow.jsx'
import { LOGO_SRC } from '../lib/branding.js'
import { formatWeekRange, generateWeekDays } from '../lib/calendarWeek.js'
import { localCalendarYmd } from '../lib/localDate.js'
import CalendarView from '../components/dashboard/CalendarView.jsx'
import TasksView from '../components/dashboard/TasksView.jsx'
import TimeTrackingView from '../components/dashboard/TimeTrackingView.jsx'
import RewardsView from '../components/dashboard/RewardsView.jsx'
import MealsView from '../components/dashboard/MealsView.jsx'
import ChartsView from '../components/dashboard/ChartsView.jsx'

function generateTimeSlots() {
  const slots = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return slots
}
const TIME_SLOTS = generateTimeSlots()
const WEEK_DAYS_OPTS = [
  { key: 'seg', label: 'Seg' }, { key: 'ter', label: 'Ter' }, { key: 'qua', label: 'Qua' },
  { key: 'qui', label: 'Qui' }, { key: 'sex', label: 'Sex' }, { key: 'sab', label: 'Sáb' }, { key: 'dom', label: 'Dom' },
]

const defaultTaskDraft = {
  profileKey: '', participants: [], title: '',
  timeType: 'none', timeValue: '',
  recurrence: 'única', recurrenceDays: [],
  priority: 0, reward: '', points: 0,
}
const defaultEventDraft = {
  eventDate: '', dayKey: '', title: '', time: '09:00', members: [],
  recurrenceType: 'único', recurrenceDays: [],
}
const defaultCategoryDraft = { icon: '📂', name: '', visibilityKeys: [], iconFile: null }
const defaultRewardDraft = { tierId: 'tier-8', value: '' }
const defaultProfileDraft = { name: '', relation: 'Filho(a)', profileType: 'Criança', age: '', color: '#7c6aef' }
const defaultFavoriteDraft = { icon: '⭐', label: '', cat: '', sub: '', detail: '', profileKey: '', participantKeys: [], iconFile: null }

function CategorySelect({ categories, value, onChange }) {
  const [custom, setCustom] = useState(false)

  if (custom || categories.length === 0) {
    return (
      <div>
        <input
          placeholder="Categoria (ex: 💼 Trabalho)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {categories.length > 0 && (
          <button type="button" className="ib" style={{ fontSize: '0.68em', marginTop: 2 }} onClick={() => setCustom(false)}>
            Escolher existente
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="form-label">📂 Categoria</div>
      <select
        className="sel"
        value={value}
        onChange={(e) => {
          if (e.target.value === '__new__') { setCustom(true); onChange('') }
          else onChange(e.target.value)
        }}
      >
        <option value="">Selecionar categoria...</option>
        {categories.map((cat) => (
          <option key={cat.id} value={`${cat.icon} ${cat.name}`}>
            {cat.icon} {cat.name}
          </option>
        ))}
        <option value="__new__">+ Nova categoria</option>
      </select>
    </div>
  )
}

function DashboardPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { mode, preference, setPreference } = useUiMode()
  const {
    workspace, syncState, setCurrentTab, setCurrentProf, setCurrentView,
    addTask, updateTask, deleteTask, addCategory, updateCategory, deleteCategory,
    uploadCategoryIcon, deleteCategoryIcon,
    refreshWorkspace,
    addCalendarEvent,
    addReward, addProfile, updateProfile, addFavorite, removeFavorite, reorderFavorites,
    startFavorite, startCustomActivity, addManualTimeEntry, togglePause, stopTimer,
    updateTimeEntry, deleteTimeEntry,
    formatClock, formatMinutes,
  } = useAppData()

  const weather = useWeather()

  const [headerNow, setHeaderNow] = useState(() => new Date())
  const [modal, setModal] = useState('')
  const [taskDraft, setTaskDraft] = useState(defaultTaskDraft)
  const [editingTask, setEditingTask] = useState(null)
  const [eventDraft, setEventDraft] = useState(defaultEventDraft)
  const [categoryDraft, setCategoryDraft] = useState(defaultCategoryDraft)
  const [rewardDraft, setRewardDraft] = useState(defaultRewardDraft)
  const [profileDraft, setProfileDraft] = useState(defaultProfileDraft)
  const [editingMember, setEditingMember] = useState(null)
  const [favoriteDraft, setFavoriteDraft] = useState(defaultFavoriteDraft)
  const [weekOffset, setWeekOffset] = useState(0)
  const [avatarCropSrc, setAvatarCropSrc] = useState(null)
  const [editingCategory, setEditingCategory] = useState(null)
  const [eventModalError, setEventModalError] = useState('')

  const profiles = workspace.profiles
  const currentProfile = profiles[workspace.currentProf] ?? profiles.gestor
  const nonManagerProfiles = Object.values(profiles).filter((p) => p.key !== 'gestor')

  const allCategories = useMemo(() => {
    const seen = new Set()
    const result = []
    Object.values(profiles).forEach((p) => {
      (p.categories ?? []).forEach((cat) => {
        const key = `${cat.icon}|${cat.name}`
        if (!seen.has(key)) {
          seen.add(key)
          result.push(cat)
        }
      })
    })
    return result
  }, [profiles])
  const visibleProfiles = useMemo(() => {
    if (user?.role === 'user') return Object.values(profiles).filter((p) => p.key !== 'gestor')
    return Object.values(profiles)
  }, [profiles, user?.role])

  const weekRangeForNav = useMemo(() => formatWeekRange(generateWeekDays(weekOffset)), [weekOffset])

  useEffect(() => {
    const interval = window.setInterval(() => setHeaderNow(new Date()), 60000)
    return () => window.clearInterval(interval)
  }, [])

  const headerDateLabel = headerNow.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
  const headerTimeLabel = headerNow.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  function visibilityToKeys(visibility) {
    if (!visibility) return ['todos']
    let arr
    if (Array.isArray(visibility)) {
      arr = visibility
    } else if (typeof visibility === 'string') {
      try {
        arr = JSON.parse(visibility)
      } catch {
        return ['todos']
      }
    } else {
      return ['todos']
    }
    if (!Array.isArray(arr)) return ['todos']
    if (arr.includes('Todos')) return ['todos']
    const keys = []
    for (const name of arr) {
      const p = nonManagerProfiles.find((m) => m.name === name)
      if (p) keys.push(p.key)
    }
    return keys.length ? keys : ['todos']
  }

  function openCategoryForEdit(cat) {
    setEditingCategory(cat)
    setCategoryDraft({
      icon: cat.icon,
      name: cat.name,
      visibilityKeys: visibilityToKeys(cat.visibility),
      iconFile: null,
    })
    setModal('category')
  }

  function openModal(key, profileKey) {
    setModal(key)
    if (key === 'event') {
      setEventModalError('')
      const today = workspace.weekDays?.find((d) => d.today)
      const eventDate = today?.fullDate && /^\d{4}-\d{2}-\d{2}$/.test(today.fullDate) ? today.fullDate : localCalendarYmd()
      setEventDraft({
        ...defaultEventDraft,
        eventDate,
        dayKey: '',
        members: workspace.currentProf === 'gestor' ? [] : [workspace.currentProf],
      })
    }
    if (key === 'category') {
      setEditingCategory(null)
      setCategoryDraft(defaultCategoryDraft)
    }
    if (key === 'task') {
      const defaultKey = profileKey || (workspace.currentProf === 'gestor' ? (nonManagerProfiles[0]?.key || '') : workspace.currentProf)
      setTaskDraft({ ...defaultTaskDraft, profileKey: defaultKey, participants: defaultKey ? [defaultKey] : [] })
      setEditingTask(null)
    }
    if (key === 'add-person') {
      setEditingMember(null)
      setProfileDraft(defaultProfileDraft)
    }
  }

  function closeModal() {
    setModal('')
    setEditingTask(null)
    setEditingMember(null)
    setEditingCategory(null)
    setTaskDraft(defaultTaskDraft)
    setEventDraft(defaultEventDraft)
    setCategoryDraft(defaultCategoryDraft)
    setRewardDraft(defaultRewardDraft)
    setProfileDraft(defaultProfileDraft)
    setFavoriteDraft(defaultFavoriteDraft)
    setAvatarCropSrc(null)
    setEventModalError('')
  }

  function editTask(profileKey, task) {
    setEditingTask(task)
    let recurrence = task.recurrence || 'única'
    let recurrenceDays = []
    if (recurrence && recurrence.startsWith('dias:')) {
      recurrenceDays = recurrence.replace('dias:', '').split(',').filter(Boolean)
      recurrence = 'dias-específicos'
    }
    const participants = (task.participantKeys && task.participantKeys.length > 0)
      ? task.participantKeys
      : (profileKey ? [profileKey] : [])
    setTaskDraft({
      profileKey,
      participants,
      title: task.title,
      timeType: task.timeType || 'none',
      timeValue: task.timeValue || '',
      recurrence,
      recurrenceDays,
      priority: task.priority || 0,
      reward: task.reward || '',
      points: task.points || 0,
    })
    setModal('task')
  }

  function openEditMember(profile) {
    setEditingMember(profile)
    setProfileDraft({
      name: profile.name || '',
      relation: profile.relation || 'Filho(a)',
      profileType: profile.profileType || profile.type || 'Criança',
      age: profile.age != null ? String(profile.age) : '',
      color: profile.color || '#7c6aef',
    })
    setModal('add-person')
  }

  function todayEvents() {
    const todayKey = workspace.weekDays?.find((d) => d.today)?.key ?? 'qua'
    const items = workspace.calendar[todayKey] ?? []
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
    if (count >= 4) return 'Dia cheio'
    if (count >= 2) return 'Dia moderado'
    return 'Dia tranquilo'
  }

  function toggleRecurrenceDay(day) {
    setTaskDraft((c) => ({
      ...c,
      recurrenceDays: c.recurrenceDays.includes(day)
        ? c.recurrenceDays.filter((d) => d !== day)
        : [...c.recurrenceDays, day],
    }))
  }

  function toggleEventRecurrenceDay(day) {
    setEventDraft((c) => ({
      ...c,
      recurrenceDays: c.recurrenceDays.includes(day)
        ? c.recurrenceDays.filter((d) => d !== day)
        : [...c.recurrenceDays, day],
    }))
  }

  async function submitTask(event) {
    event.preventDefault()
    if (!taskDraft.title.trim()) return
    const recurrenceValue = taskDraft.recurrence === 'dias-específicos'
      ? `dias:${taskDraft.recurrenceDays.join(',')}`
      : taskDraft.recurrence
    const participants = taskDraft.participants.length > 0 ? taskDraft.participants : (taskDraft.profileKey ? [taskDraft.profileKey] : [])
    const payload = {
      profileKey: participants[0] || taskDraft.profileKey,
      participants,
      title: taskDraft.title,
      timeType: taskDraft.timeType,
      timeValue: taskDraft.timeType !== 'none' ? taskDraft.timeValue : '',
      recurrence: recurrenceValue,
      priority: taskDraft.priority,
      reward: taskDraft.reward,
      points: Number(taskDraft.points) || 0,
    }
    if (editingTask) {
      await updateTask(taskDraft.profileKey, editingTask.id, { ...payload, participantKeys: participants })
    } else {
      await addTask(payload)
    }
    closeModal()
  }

  async function submitCategory(event) {
    event.preventDefault()
    if (!categoryDraft.name.trim()) return
    const keys = categoryDraft.visibilityKeys
    let visibilityScope
    if (keys.length === 0 || keys.includes('todos')) {
      visibilityScope = ['Todos']
    } else {
      visibilityScope = keys.map((k) => nonManagerProfiles.find((p) => p.key === k)?.name ?? k)
    }
    const pk = workspace.currentProf === 'gestor' ? (nonManagerProfiles[0]?.key || 'mae') : workspace.currentProf
    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, {
          icon: categoryDraft.icon,
          name: categoryDraft.name,
          visibility: visibilityScope,
        })
        if (categoryDraft.iconFile) {
          await uploadCategoryIcon(editingCategory.id, categoryDraft.iconFile)
        }
      } else {
        const created = await addCategory({
          profileKey: pk,
          icon: categoryDraft.icon,
          name: categoryDraft.name,
          visibility: visibilityScope,
        })
        if (categoryDraft.iconFile && created?.id) {
          await uploadCategoryIcon(created.id, categoryDraft.iconFile)
        } else {
          await refreshWorkspace()
        }
      }
      closeModal()
    } catch (err) {
      window.alert(err?.message || 'Não foi possível salvar a categoria.')
    }
  }

  async function submitEvent(event) {
    event.preventDefault()
    const title = eventDraft.title.trim()
    if (!title) {
      setEventModalError('Informe o nome do evento.')
      return
    }
    let eventDate = (eventDraft.eventDate || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      eventDate = localCalendarYmd()
    }
    const dayKey = (eventDraft.dayKey || '').trim()
    if (!dayKey && !eventDate) {
      setEventModalError('Escolha uma data para o evento.')
      return
    }
    const recurrenceDaysStr = (eventDraft.recurrenceDays || []).join(',')
    setEventModalError('')
    try {
      await addCalendarEvent({
        title,
        time: eventDraft.time || '09:00',
        eventDate,
        dayKey,
        members: Array.isArray(eventDraft.members) ? eventDraft.members : [],
        cls: 'ce-all',
        recurrenceType: eventDraft.recurrenceType || 'único',
        recurrenceDays: recurrenceDaysStr,
      })
      closeModal()
    } catch (err) {
      setEventModalError(err.message || 'Não foi possível salvar o evento.')
    }
  }

  async function submitReward(event) {
    event.preventDefault()
    if (!rewardDraft.value.trim()) return
    await addReward(rewardDraft)
    closeModal()
  }

  function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setAvatarCropSrc(ev.target.result)
    }
    reader.readAsDataURL(file)
  }

  async function submitProfile(event) {
    event.preventDefault()
    if (!profileDraft.name.trim()) return
    if (editingMember) {
      await updateProfile(editingMember.id, {
        name: profileDraft.name,
        relation: profileDraft.relation,
        profileType: profileDraft.profileType,
        age: profileDraft.age,
        color: profileDraft.color,
        avatarUrl: profileDraft.avatarUrl ?? editingMember.avatarUrl,
      })
    } else {
      const key = `${profileDraft.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-')}-${Date.now()}`
      await addProfile({
        key, name: profileDraft.name, short: '0/0 tarefas', color: profileDraft.color,
        avatar: profileDraft.name[0]?.toUpperCase() ?? 'P', type: 'member', statusColor: '#22c55e',
        relation: profileDraft.relation, profileType: profileDraft.profileType, age: profileDraft.age,
        tasks: [], categories: [], favorites: [], workSubs: [],
        tracking: { active: false, paused: false, cat: '🏠 Casa', sub: '', detail: '', seconds: 0, totalMinutes: 0, activeSessions: [], log: [] },
      })
    }
    closeModal()
  }

  async function submitFavorite(event) {
    event.preventDefault()
    if (!favoriteDraft.label.trim()) return
    const participants = favoriteDraft.participantKeys.length > 0 ? favoriteDraft.participantKeys : [workspace.currentProf]
    const targetProfile = participants[0] || workspace.currentProf
    const label = favoriteDraft.label.trim()
    const subFromForm = favoriteDraft.sub.trim()
    try {
      await addFavorite(targetProfile, {
        ...favoriteDraft,
        label,
        sub: subFromForm || label,
        participantKeys: participants,
        iconFile: favoriteDraft.iconFile,
      })
      closeModal()
    } catch (err) {
      window.alert(err?.message || 'Não foi possível salvar o favorito.')
    }
  }

  function renderContent() {
    const tab = workspace.currentTab
    if (tab === 'cal') return (
      <CalendarView
        workspace={workspace}
        profiles={profiles}
        currentProf={workspace.currentProf}
        nonManagerProfiles={nonManagerProfiles}
        openModal={openModal}
        weekOffset={weekOffset}
      />
    )
    if (tab === 'tasks') return (
      <TasksView
        workspace={workspace}
        profiles={profiles}
        currentProfile={currentProfile}
        nonManagerProfiles={nonManagerProfiles}
        openModal={openModal}
        updateTask={updateTask}
        deleteTask={deleteTask}
        editTask={editTask}
      />
    )
    if (tab === 'time') return (
      <TimeTrackingView
        workspace={workspace}
        profiles={profiles}
        currentProf={workspace.currentProf}
        currentProfile={currentProfile}
        nonManagerProfiles={nonManagerProfiles}
        formatClock={formatClock}
        formatMinutes={formatMinutes}
        togglePause={togglePause}
        stopTimer={stopTimer}
        startFavorite={startFavorite}
        removeFavorite={removeFavorite}
        reorderFavorites={reorderFavorites}
        startCustomActivity={startCustomActivity}
        addManualTimeEntry={addManualTimeEntry}
        openModal={openModal}
        openCategoryForEdit={openCategoryForEdit}
        updateTimeEntry={updateTimeEntry}
        deleteTimeEntry={deleteTimeEntry}
      />
    )
    if (tab === 'rewards') return <RewardsView workspace={workspace} openModal={openModal} setRewardDraft={setRewardDraft} />
    if (tab === 'meals') return <MealsView workspace={workspace} />
    return <ChartsView />
  }

  const settingsProfile = workspace.currentProf === 'gestor' ? nonManagerProfiles[0] : currentProfile

  /** Só no primeiro carregamento do workspace; recargas em background não cobrem o ecrã. */
  const showWorkspaceSplash = user?.role !== 'super_admin' && syncState.initialSyncDone !== true

  const mainColumn = (
    <>
      <div className="top-wrap">
            <div className="top-row1">
              <div className="top-brand">
                <img
                  src={LOGO_SRC}
                  alt="Tina"
                  className="brand-logo-top"
                  width={184}
                  height={44}
                  decoding="async"
                />
              </div>
              <div className="top-row1-center">
                <button
                  type="button"
                  className="wt wt--header weather-header-btn"
                  onClick={() => setModal('weather')}
                  aria-label={
                    weather.snapshot?.current?.temperature_2m != null
                      ? `Clima: ${Math.round(weather.snapshot.current.temperature_2m)} graus. Abrir previsão`
                      : 'Abrir clima e escolher localização'
                  }
                >
                  {weather.snapshot?.current ? (
                    <WeatherLucideIcon code={weather.snapshot.current.weather_code} size={28} />
                  ) : (
                    <span className="wt-ic-svg" aria-hidden>
                      <CloudSun size={28} strokeWidth={1.75} />
                    </span>
                  )}
                  <div className="wt-t">
                    {weather.loading && !weather.snapshot && weather.prefs
                      ? '…'
                      : weather.snapshot?.current?.temperature_2m != null
                        ? `${Math.round(weather.snapshot.current.temperature_2m)}°C`
                        : 'Clima'}
                  </div>
                </button>
                <div className="top-row1-datetime" aria-label="Data e hora">
                  <span className="top-row1-date">{headerDateLabel}</span>
                  <span className="top-row1-time">{headerTimeLabel}</span>
                </div>
              </div>
              <div className="top-row1-tail">
                <div className={`day-badge day-badge-with-icon ${dayBadgeClass()}`}>
                  <Pin size={14} strokeWidth={2.5} className="day-badge-pin" aria-hidden />
                  <span>{dayBadgeLabel()}</span>
                </div>
              </div>
            </div>

            <div className="top-row2">
              {visibleProfiles.map((profile) => {
                const done = profile.tasks?.filter((t) => t.done).length ?? 0
                const total = profile.tasks?.length ?? 0
                return (
                  <button
                    className={`pf${workspace.currentProf === profile.key ? ' on' : ''}`}
                    data-m={profile.key}
                    key={profile.key}
                    onClick={() => setCurrentProf(profile.key)}
                    style={profile.key === 'vovo' ? { opacity: 0.7 } : undefined}
                    aria-label={`Perfil ${profile.name}`}
                  >
                    <div className="av" style={profile.avatarUrl ? { backgroundImage: `url('${profile.avatarUrl}')`, backgroundSize: 'cover' } : { background: `linear-gradient(135deg,${profile.color},#666)` }}>
                      {!profile.avatarUrl ? profile.avatar ?? profile.name[0] : <span style={{ display: 'none' }}>{profile.name[0]}</span>}
                    </div>
                    <div className="pf-info">
                      <div className="pf-n">
                        {profile.name}
                        {profile.statusColor && <div className="pf-dot" style={{ background: profile.statusColor }} />}
                      </div>
                      <div className="pf-s">{profile.short ?? `${done}/${total} tarefas`}</div>
                    </div>
                  </button>
                )
              })}
              {user?.role !== 'user' && (
                <button type="button" className="add-person" onClick={() => openModal('add-person')} aria-label="Adicionar pessoa">
                  <Plus size={22} strokeWidth={2.5} />
                </button>
              )}
            </div>

            {workspace.currentTab === 'cal' && (
              <div className="top-row3">
                <div className="date-nav">
                  <button type="button" className="ar" aria-label="Semana anterior" onClick={() => setWeekOffset((w) => w - 1)}>‹</button>
                  <span className="rng">{weekRangeForNav}</span>
                  <button type="button" className="ar" aria-label="Próxima semana" onClick={() => setWeekOffset((w) => w + 1)}>›</button>
                </div>
                <div className="date-vt">
                  {['Semanal', 'Mensal'].map((view) => (
                    <button key={view} type="button" className={workspace.currentView === view ? 'on' : ''} onClick={() => setCurrentView(view)}>{view}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

      <div className="ct" id="content-area">
        {syncState.error && <div className="feedback error">{syncState.error}</div>}
        <ErrorBoundary>{renderContent()}</ErrorBoundary>
      </div>
    </>
  )

  const shellProps = {
    currentTab: workspace.currentTab,
    setCurrentTab,
    onOpenSettings: () => openModal('settings'),
  }

  return (
    <>
      {showWorkspaceSplash ? <AppLoadingScreen subtitle="Sincronizando dados…" /> : null}
      {mode === 'tablet' ? (
        <TabletShell {...shellProps}>{mainColumn}</TabletShell>
      ) : (
        <MobileShell {...shellProps}>{mainColumn}</MobileShell>
      )}

      <WeatherModal isOpen={modal === 'weather'} onClose={closeModal} weather={weather} />

      {/* Modal: Nova / Editar Tarefa */}
      <Modal isOpen={modal === 'task'} id="modal-task" onClose={closeModal} title={editingTask ? 'Editar tarefa' : 'Nova tarefa'}>
        <form onSubmit={submitTask}>
          <div className="form-label">👥 Participantes</div>
          <PeoplePicker
            profiles={nonManagerProfiles}
            selected={taskDraft.participants}
            multi
            onChange={(keys) => setTaskDraft((c) => ({ ...c, participants: keys, profileKey: keys[0] || c.profileKey }))}
            label=""
          />

          <input
            placeholder="Nome da tarefa *"
            value={taskDraft.title}
            onChange={(e) => setTaskDraft((c) => ({ ...c, title: e.target.value }))}
          />

          <div className="form-label">⏰ Horário</div>
          <div className="radio-row">
            {[['none', 'Sem horário'], ['time', 'Horário específico'], ['shift', 'Turno']].map(([val, lbl]) => (
              <label key={val} className="radio-opt">
                <input
                  type="radio"
                  name="timeType"
                  value={val}
                  checked={taskDraft.timeType === val}
                  onChange={() => setTaskDraft((c) => ({ ...c, timeType: val, timeValue: val === 'time' ? '09:00' : val === 'shift' ? 'Manhã' : '' }))}
                />
                {lbl}
              </label>
            ))}
          </div>
          {taskDraft.timeType === 'time' && (
            <select className="sel" value={taskDraft.timeValue} onChange={(e) => setTaskDraft((c) => ({ ...c, timeValue: e.target.value }))}>
              {TIME_SLOTS.map((s) => <option key={s}>{s}</option>)}
            </select>
          )}
          {taskDraft.timeType === 'shift' && (
            <select className="sel" value={taskDraft.timeValue} onChange={(e) => setTaskDraft((c) => ({ ...c, timeValue: e.target.value }))}>
              <option>Manhã</option><option>Tarde</option><option>Noite</option>
            </select>
          )}

          <div className="form-label">📅 Recorrência</div>
          <select className="sel" value={taskDraft.recurrence} onChange={(e) => setTaskDraft((c) => ({ ...c, recurrence: e.target.value, recurrenceDays: [] }))}>
            <option value="única">Única vez</option>
            <option value="diária">Diária</option>
            <option value="semanal">Semanal</option>
            <option value="quinzenal">Quinzenal</option>
            <option value="dias-específicos">Dias específicos</option>
          </select>
          {taskDraft.recurrence === 'dias-específicos' && (
            <div className="days-picker">
              {WEEK_DAYS_OPTS.map((d) => (
                <label key={d.key} className={`day-chip${taskDraft.recurrenceDays.includes(d.key) ? ' on' : ''}`}>
                  <input type="checkbox" checked={taskDraft.recurrenceDays.includes(d.key)} onChange={() => toggleRecurrenceDay(d.key)} />
                  {d.label}
                </label>
              ))}
            </div>
          )}

          <div className="form-label">⭐ Prioridade</div>
          <div className="star-picker">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={`star-btn${n <= taskDraft.priority ? ' on' : ''}`}
                onClick={() => setTaskDraft((c) => ({ ...c, priority: c.priority === n ? 0 : n }))}
                aria-label={`Prioridade ${n}`}
              >
                ★
              </button>
            ))}
            {taskDraft.priority > 0 && (
              <span style={{ fontSize: '0.7em', color: 'var(--t3)', marginLeft: 4 }}>
                {['', 'Baixa', 'Baixa', 'Média', 'Alta', 'Urgente'][taskDraft.priority]}
              </span>
            )}
          </div>

          <input
            placeholder="🎁 Recompensa (opcional)"
            value={taskDraft.reward}
            onChange={(e) => setTaskDraft((c) => ({ ...c, reward: e.target.value }))}
          />
          <input
            type="number"
            placeholder="Pontos / estrelas"
            min="0"
            value={taskDraft.points}
            onChange={(e) => setTaskDraft((c) => ({ ...c, points: e.target.value }))}
          />
          <button className="save-btn" type="submit">{editingTask ? 'Salvar alterações' : 'Salvar Tarefa'}</button>
        </form>
      </Modal>

      {/* Modal: Novo Evento */}
      <Modal isOpen={modal === 'event'} id="modal-event" onClose={closeModal} title="Novo evento">
        <form onSubmit={submitEvent}>
          {eventModalError ? <div className="feedback error" style={{ marginBottom: 10 }}>{eventModalError}</div> : null}
          <input
            placeholder="Nome do evento *"
            value={eventDraft.title}
            autoComplete="off"
            enterKeyHint="done"
            onChange={(e) => setEventDraft((c) => ({ ...c, title: e.target.value }))}
          />

          <div className="form-label">📅 Data</div>
          <input
            type="date"
            className="sel"
            value={eventDraft.eventDate}
            onChange={(e) => setEventDraft((c) => ({ ...c, eventDate: e.target.value, dayKey: '' }))}
            style={{ marginBottom: 4 }}
          />

          <div className="form-label">⏰ Horário</div>
          <select className="sel" value={eventDraft.time} onChange={(e) => setEventDraft((c) => ({ ...c, time: e.target.value }))}>
            {TIME_SLOTS.map((s) => <option key={s}>{s}</option>)}
          </select>

          <div className="form-label">🔁 Recorrência</div>
          <select className="sel" value={eventDraft.recurrenceType} onChange={(e) => setEventDraft((c) => ({ ...c, recurrenceType: e.target.value, recurrenceDays: [] }))}>
            <option value="único">Único</option>
            <option value="semanal">Semanal</option>
            <option value="quinzenal">Quinzenal</option>
          </select>
          {(eventDraft.recurrenceType === 'semanal' || eventDraft.recurrenceType === 'quinzenal') && (
            <div className="days-picker">
              {WEEK_DAYS_OPTS.map((d) => (
                <label key={d.key} className={`day-chip${eventDraft.recurrenceDays.includes(d.key) ? ' on' : ''}`}>
                  <input type="checkbox" checked={eventDraft.recurrenceDays.includes(d.key)} onChange={() => toggleEventRecurrenceDay(d.key)} />
                  {d.label}
                </label>
              ))}
            </div>
          )}

          <PeoplePicker
            profiles={nonManagerProfiles}
            selected={eventDraft.members}
            multi
            onChange={(members) => setEventDraft((c) => ({ ...c, members }))}
            label="👥 Quem participa:"
          />
          <button className="save-btn" type="submit">Salvar Evento</button>
        </form>
      </Modal>

      <Modal isOpen={modal === 'category'} id="modal-new-cat" onClose={closeModal} title={editingCategory ? 'Editar categoria' : 'Nova categoria'}>
        <form onSubmit={submitCategory}>
          <EmojiPicker
            value={categoryDraft.icon}
            onChange={(emoji) => setCategoryDraft((c) => ({ ...c, icon: emoji }))}
            label="Ícone da categoria"
          />
          <IconUploadRow
            kind="category"
            file={categoryDraft.iconFile}
            onFileChange={(f) => setCategoryDraft((c) => ({ ...c, iconFile: f }))}
            entityId={editingCategory?.id}
            serverHasImage={Boolean(editingCategory?.iconImageUrl)}
            twemoji={categoryDraft.icon}
            onRemoveServerImage={
              editingCategory?.id
                ? async () => {
                    await deleteCategoryIcon(editingCategory.id)
                    setEditingCategory((prev) => (prev ? { ...prev, iconImageUrl: false } : prev))
                  }
                : undefined
            }
          />
          <input placeholder="Nome da categoria *" value={categoryDraft.name} onChange={(e) => setCategoryDraft((c) => ({ ...c, name: e.target.value }))} />
          <PeoplePicker
            profiles={nonManagerProfiles}
            selected={categoryDraft.visibilityKeys}
            multi
            onChange={(keys) => setCategoryDraft((c) => ({ ...c, visibilityKeys: keys }))}
            label="👁️ Visível para (selecione múltiplos):"
            includeAll
          />
          <button className="save-btn" type="submit">{editingCategory ? 'Salvar alterações' : 'Criar categoria'}</button>
          {editingCategory ? (
            <button
              type="button"
              className="save-btn"
              style={{ marginTop: 10, background: 'var(--bg)', color: '#dc2626', border: '1px solid var(--bd)' }}
              onClick={async () => {
                if (!window.confirm(`Excluir a categoria "${editingCategory.name}"?`)) return
                await deleteCategory(editingCategory.id)
                closeModal()
              }}
            >
              Excluir categoria
            </button>
          ) : null}
        </form>
      </Modal>

      <Modal isOpen={modal === 'reward'} id="modal-reward" onClose={closeModal} title="Nova recompensa">
        <form onSubmit={submitReward}>
          <select className="sel" value={rewardDraft.tierId} onChange={(e) => setRewardDraft((c) => ({ ...c, tierId: e.target.value }))}>
            {workspace.rewards.map((tier) => <option value={tier.id} key={tier.id}>{tier.label}</option>)}
          </select>
          <input placeholder="Nome da recompensa (com emoji)" value={rewardDraft.value} onChange={(e) => setRewardDraft((c) => ({ ...c, value: e.target.value }))} />
          <button className="save-btn" type="submit">Salvar Recompensa</button>
        </form>
      </Modal>

      {/* Modal: Adicionar / Editar Pessoa */}
      <Modal isOpen={modal === 'add-person'} id="modal-add-person" onClose={closeModal} title={editingMember ? 'Editar membro' : 'Adicionar pessoa'}>
        <form onSubmit={submitProfile}>
          {/* Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div
              className="av"
              style={
                profileDraft.avatarUrl
                  ? { backgroundImage: `url('${profileDraft.avatarUrl}')`, backgroundSize: 'cover', width: 56, height: 56, fontSize: '0.85em' }
                  : { background: profileDraft.color, width: 56, height: 56, fontSize: '1.2em' }
              }
            >
              {!profileDraft.avatarUrl && (profileDraft.name[0]?.toUpperCase() || '?')}
            </div>
            <div>
              <div style={{ fontSize: '0.7em', color: 'var(--t3)', marginBottom: 4 }}>Foto do perfil</div>
              <label className="ib" style={{ cursor: 'pointer' }}>
                📷 Escolher foto
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
              </label>
              {profileDraft.avatarUrl && (
                <button type="button" className="ib" style={{ marginLeft: 4, color: 'var(--rd)' }} onClick={() => setProfileDraft((c) => ({ ...c, avatarUrl: '' }))}>
                  ✕ Remover
                </button>
              )}
            </div>
          </div>

          <input placeholder="Nome *" value={profileDraft.name} onChange={(e) => setProfileDraft((c) => ({ ...c, name: e.target.value }))} />
          <select className="sel" value={profileDraft.relation} onChange={(e) => setProfileDraft((c) => ({ ...c, relation: e.target.value }))}>
            <option>Mãe</option><option>Pai</option><option>Filho(a)</option><option>Avô/Avó</option><option>Outro</option>
          </select>
          <select className="sel" value={profileDraft.profileType} onChange={(e) => setProfileDraft((c) => ({ ...c, profileType: e.target.value }))}>
            <option>Adulto (gerencia tarefas)</option><option>Criança (recebe tarefas + estrelas)</option><option>Observador (só visualiza)</option>
          </select>
          <input placeholder="Idade (opcional)" value={profileDraft.age} onChange={(e) => setProfileDraft((c) => ({ ...c, age: e.target.value }))} />
          <div className="form-label">🎨 Cor do perfil</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            {['#7c6aef', '#2d9cdb', '#27ae60', '#e84393', '#e67e22', '#ef4444', '#f59e0b', '#06b6d4'].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setProfileDraft((p) => ({ ...p, color: c }))}
                style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: profileDraft.color === c ? '3px solid #1e1e2e' : '2px solid transparent', cursor: 'pointer' }}
                aria-label={`Cor ${c}`}
              />
            ))}
          </div>
          <button className="save-btn" type="submit">{editingMember ? 'Salvar alterações' : 'Adicionar à Família'}</button>
        </form>
      </Modal>

      <Modal isOpen={modal === 'add-fav'} id="modal-add-fav" onClose={closeModal} title="Novo favorito">
        <form onSubmit={submitFavorite}>
          <PeoplePicker
            profiles={nonManagerProfiles}
            selected={favoriteDraft.participantKeys}
            multi
            onChange={(keys) => setFavoriteDraft((c) => ({ ...c, participantKeys: keys, profileKey: keys[0] || c.profileKey }))}
            label="👥 Participantes"
          />
          <EmojiPicker
            value={favoriteDraft.icon}
            onChange={(emoji) => setFavoriteDraft((c) => ({ ...c, icon: emoji }))}
            label="Ícone"
          />
          <IconUploadRow
            kind="favorite"
            file={favoriteDraft.iconFile}
            onFileChange={(f) => setFavoriteDraft((c) => ({ ...c, iconFile: f }))}
            entityId={undefined}
            serverHasImage={false}
            twemoji={favoriteDraft.icon}
          />
          <input placeholder="Nome da tarefa *" value={favoriteDraft.label} onChange={(e) => setFavoriteDraft((c) => ({ ...c, label: e.target.value }))} />
          <CategorySelect
            categories={allCategories}
            value={favoriteDraft.cat}
            onChange={(val) => setFavoriteDraft((c) => ({ ...c, cat: val }))}
          />
          <input placeholder="Subcategoria" value={favoriteDraft.sub} onChange={(e) => setFavoriteDraft((c) => ({ ...c, sub: e.target.value }))} />
          <input placeholder="Detalhe" value={favoriteDraft.detail} onChange={(e) => setFavoriteDraft((c) => ({ ...c, detail: e.target.value }))} />
          <button className="save-btn" type="submit">Adicionar Favorito</button>
        </form>
      </Modal>

      <Modal isOpen={modal === 'manage-fav'} id="modal-manage-fav" onClose={closeModal} title="Gerenciar favoritos">
        <div style={{ fontSize: '0.78em', color: 'var(--t3)', marginBottom: 10 }}>
          Remova ou revise os atalhos rápidos do perfil atual.
        </div>
        {(settingsProfile?.favorites ?? []).length > 0 ? (
          settingsProfile.favorites.map((fav) => (
            <div key={fav.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--bd)', fontSize: '0.85em' }}>
              <FavOrCatIcon
                type="favorite"
                id={fav.id}
                emoji={fav.icon}
                hasCustomImage={Boolean(fav.iconImageUrl)}
                size={24}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{fav.label}</div>
                <div style={{ fontSize: '0.78em', color: 'var(--t3)' }}>{fav.cat}{fav.sub ? ` → ${fav.sub}` : ''}</div>
              </div>
              <button className="ib" onClick={() => removeFavorite(settingsProfile.key, fav.id)} aria-label={`Remover ${fav.label}`}>✕ Remover</button>
            </div>
          ))
        ) : (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div className="empty-state">Nenhum favorito ainda.</div>
            <button className="save-btn" style={{ marginTop: 10 }} onClick={() => { closeModal(); openModal('add-fav') }}>
              ➕ Adicionar primeiro favorito
            </button>
          </div>
        )}
      </Modal>

      <Modal isOpen={modal === 'settings'} id="modal-settings" onClose={closeModal} title="Configurações">
        <div style={{ fontSize: '0.82em' }}>
          <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--bd)' }}>
            <div style={{ fontWeight: 700, fontSize: '0.9em', marginBottom: 8, color: 'var(--t2)' }}>Interface</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="ib"
                style={
                  preference === 'auto'
                    ? { borderColor: 'var(--brand)', color: 'var(--brand-dark)', background: 'rgba(255,130,0,0.12)', borderStyle: 'solid' }
                    : {}
                }
                onClick={() => setPreference('auto')}
              >
                Automático
              </button>
              <button
                type="button"
                className="ib"
                style={
                  preference === 'tablet'
                    ? { borderColor: 'var(--brand)', color: 'var(--brand-dark)', background: 'rgba(255,130,0,0.12)', borderStyle: 'solid' }
                    : {}
                }
                onClick={() => setPreference('tablet')}
              >
                Tablet
              </button>
              <button
                type="button"
                className="ib"
                style={
                  preference === 'mobile'
                    ? { borderColor: 'var(--brand)', color: 'var(--brand-dark)', background: 'rgba(255,130,0,0.12)', borderStyle: 'solid' }
                    : {}
                }
                onClick={() => setPreference('mobile')}
              >
                Celular
              </button>
            </div>
            <div style={{ fontSize: '0.72em', color: 'var(--t3)', marginTop: 8, lineHeight: 1.35 }}>
              {preference === 'auto'
                ? `Automático: usa barra inferior em telas até 900px de largura; acima disso, layout tablet. Agora: ${mode === 'mobile' ? 'celular' : 'tablet'}.`
                : 'Layout fixo conforme opção acima. Salvo neste aparelho.'}
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9em', marginBottom: 6, color: 'var(--t2)' }}>Membros da família</div>
            {nonManagerProfiles.map((p) => (
              <div key={p.key} className="ti" style={{ gap: 8, padding: '6px 0' }}>
                <div className="av" style={p.avatarUrl ? { backgroundImage: `url('${p.avatarUrl}')`, backgroundSize: 'cover', width: 28, height: 28, fontSize: '0.7em' } : { background: p.color, width: 28, height: 28, fontSize: '0.7em' }}>
                  {!p.avatarUrl && p.name[0]}
                </div>
                <span style={{ flex: 1, fontWeight: 600 }}>{p.name}</span>
                <span style={{ color: 'var(--t3)', fontSize: '0.85em' }}>{p.relation || p.profileType}</span>
                <button type="button" className="ib" onClick={() => { closeModal(); openEditMember(p) }}>Editar</button>
              </div>
            ))}
            <button type="button" className="ib" style={{ marginTop: 6 }} onClick={() => openModal('add-person')}>Adicionar membro</button>
          </div>
          <div className="ti"><span className="tl">Categorias</span><button type="button" className="ib" onClick={() => openModal('category')}>Editar</button></div>
          <div className="ti"><span className="tl">Sincronização</span><span className="tt">{syncState.loading ? 'Sincronizando' : 'Ativo'}</span></div>
          <div className="ti"><span className="tl">Papel atual</span><span className="tt">{user?.role}</span></div>
          {user?.role === 'super_admin' && (
            <div className="ti"><span className="tl">Painel super admin</span><button type="button" className="ib" onClick={() => navigate('/super-admin')}>Abrir</button></div>
          )}
          <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
            <button className="ib" onClick={() => logout()}>Sair</button>
          </div>
        </div>
      </Modal>

      {avatarCropSrc &&
        createPortal(
          <AvatarCropModal
            imageSrc={avatarCropSrc}
            onClose={() => setAvatarCropSrc(null)}
            onConfirm={(dataUrl) => {
              setProfileDraft((c) => ({ ...c, avatarUrl: dataUrl }))
              setAvatarCropSrc(null)
            }}
          />,
          document.body,
        )}
    </>
  )
}

export default DashboardPage
