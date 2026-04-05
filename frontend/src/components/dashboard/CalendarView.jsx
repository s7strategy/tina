import MonthlyCalendarView from './MonthlyCalendarView.jsx'

export default function CalendarView({ workspace, profiles, currentProf, nonManagerProfiles, openModal, weekOffset = 0 }) {
  const isManager = currentProf === 'gestor'
  const isMonthly = workspace.currentView === 'Mensal'

  if (isMonthly) {
    return (
      <MonthlyCalendarView
        workspace={workspace}
        profiles={profiles}
        currentProf={currentProf}
        openModal={openModal}
      />
    )
  }

  return (
    <WeeklyCalendarView
      workspace={workspace}
      profiles={profiles}
      currentProf={currentProf}
      nonManagerProfiles={nonManagerProfiles}
      openModal={openModal}
      isManager={isManager}
      weekOffset={weekOffset}
    />
  )
}

function WeeklyCalendarView({ workspace, profiles, currentProf, nonManagerProfiles, openModal, isManager, weekOffset }) {
  const profile = profiles[currentProf]
  const todayKey = workspace.weekDays?.find((d) => d.today)?.key ?? 'qua'

  function memberNames(memberKeys) {
    return memberKeys.map((key) => profiles[key]?.name ?? key).join(' · ')
  }

  function getEvents(dayKey) {
    const events = workspace.calendar[dayKey] ?? []
    if (isManager) return events
    return events.filter((item) => item.members.includes(currentProf))
  }

  const todaysEvents = getEvents(todayKey)

  function dayBadgeLabel() {
    const count = todaysEvents.length
    if (count >= 4) return '📌 Dia cheio'
    if (count >= 2) return '📌 Dia moderado'
    return '📌 Dia tranquilo'
  }

  function dayBadgeClass() {
    const count = todaysEvents.length
    if (count >= 4) return 'cheio'
    if (count >= 2) return 'moderado'
    return 'tranquilo'
  }

  return (
    <>
      {isManager ? (
        <div className="mbars">
          {Object.values(profiles).filter((p) => p.key !== 'gestor').map((p) => (
            <div className="mb" style={{ background: p.color }} key={p.key}>
              ● {p.name}
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

      {todaysEvents.length > 0 && weekOffset === 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 12px', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontFamily: "'Plus Jakarta Sans'", fontWeight: 800, fontSize: '0.9em' }}>HOJE 🌤️</span>
            <span className={`day-badge ${dayBadgeClass()}`} style={{ marginLeft: 'auto', fontSize: '0.72em' }}>
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
                {isManager && (
                  <div style={{ fontSize: '0.85em', color: 'var(--t3)', marginTop: 1 }}>{memberNames(item.members)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {weekOffset !== 0 && (
        <div style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 10, padding: '8px 12px', marginBottom: 8, fontSize: '0.75em', color: '#4338ca', fontWeight: 600 }}>
          📅 Semana {weekOffset > 0 ? `+${weekOffset}` : weekOffset} em relação à atual
        </div>
      )}

      <div className="cg">
        {workspace.weekDays.filter((day) => !day.today).map((day) => {
          const events = getEvents(day.key)
          return (
            <div className="cd" key={day.key}>
              <div className="cd-h">
                <span className="cd-n">{day.name}</span>
                <span className="cd-d">{day.num}</span>
              </div>
              <div className="cd-c">{events.length} evento{events.length !== 1 ? 's' : ''}</div>
              {events.map((item) => (
                <div
                  className={`ce ${isManager ? item.cls : ''}`}
                  key={item.id}
                  style={!isManager ? { background: `${profile.color}15`, borderLeftColor: profile.color } : undefined}
                >
                  <span className="ce-t">{item.title}</span> <span className="ce-m">{item.time}</span>
                  {isManager && (
                    <div style={{ fontSize: '0.85em', color: 'var(--t3)', marginTop: 1 }}>{memberNames(item.members)}</div>
                  )}
                </div>
              ))}
            </div>
          )
        })}

        {isManager && (
          <div className="cd" style={{ background: 'var(--bg)', border: 'none' }}>
            <div style={{ fontSize: '0.65em', fontWeight: 700, color: 'var(--t2)', marginBottom: 6 }}>Tarefas Hoje</div>
            {nonManagerProfiles.map((p) => {
              const total = p.tasks?.length || 1
              const done = p.tasks?.filter((t) => t.done).length || 0
              const pct = Math.round((done / total) * 100)
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3, fontSize: '0.65em' }} key={`progress-${p.key}`}>
                  <span style={{ color: p.color, fontWeight: 700 }}>{p.name}</span>
                  <div style={{ flex: 1, height: 6, background: '#e8e5e0', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: p.color, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontWeight: 700 }}>{done}/{total}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ marginTop: 10 }}>
        <button className="ib" style={{ width: '100%', textAlign: 'center', padding: 10, fontSize: '0.82em', borderRadius: 10 }} onClick={() => openModal('event')} aria-label="Adicionar novo evento">
          ➕ Novo evento
        </button>
      </div>
    </>
  )
}
