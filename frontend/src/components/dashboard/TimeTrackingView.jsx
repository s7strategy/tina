import { useState } from 'react'
import { TwemojiImg } from '../ui/EmojiPicker.jsx'

function TimelineEntry({ entry, profile, formatMinutes, updateTimeEntry, deleteTimeEntry }) {
  const [mode, setMode] = useState('view')
  const [editName, setEditName] = useState(entry.name)

  async function handleSave() {
    const parts = editName.split(' → ')
    await updateTimeEntry(entry.id, { cat: parts[0] || editName, sub: parts[1] || '', detail: '' })
    setMode('view')
  }

  async function handleDelete() {
    if (entry.active) return
    setMode('confirm-delete')
  }

  async function confirmDelete() {
    await deleteTimeEntry(entry.id)
    setMode('view')
  }

  if (mode === 'edit') {
    return (
      <div style={{ padding: '6px 0', borderBottom: '1px solid var(--bd)' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            style={{ flex: 1, fontSize: '0.78em', padding: '4px 8px', borderRadius: 6, border: '1.5px solid var(--mae)' }}
            autoFocus
          />
          <button className="ib" onClick={handleSave} style={{ color: 'var(--gn)', fontWeight: 700 }}>✓</button>
          <button className="ib" onClick={() => { setMode('view'); setEditName(entry.name) }} style={{ color: 'var(--t3)' }}>✕</button>
        </div>
      </div>
    )
  }

  if (mode === 'confirm-delete') {
    return (
      <div style={{ padding: '8px', borderBottom: '1px solid var(--bd)', background: '#fef2f2', borderRadius: 6, marginBottom: 2 }}>
        <div style={{ fontSize: '0.75em', fontWeight: 600, color: '#dc2626', marginBottom: 6 }}>Excluir "{entry.name}"?</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="ib" onClick={confirmDelete} style={{ color: 'white', background: '#dc2626', borderRadius: 6, padding: '3px 10px', fontSize: '0.72em', fontWeight: 700 }}>Excluir</button>
          <button className="ib" onClick={() => setMode('view')} style={{ fontSize: '0.72em' }}>Cancelar</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--bd)', ...(entry.active ? { background: '#f0f9ff', borderRadius: 6, padding: '6px 8px', border: 'none', marginBottom: 2 } : {}) }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: entry.active ? 'var(--gn)' : profile.color, flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: '0.78em', fontWeight: 600 }}>{entry.name}</div>
      <div style={{ fontSize: '0.72em', color: 'var(--t3)', flexShrink: 0 }}>{entry.time}</div>
      <div style={{ fontFamily: "'Plus Jakarta Sans'", fontSize: '0.78em', fontWeight: 700, flexShrink: 0, width: 42, textAlign: 'right' }}>
        {formatMinutes(entry.durationMinutes)}
      </div>
      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
        <button onClick={() => { setEditName(entry.name); setMode('edit') }} className="ib" style={{ padding: '2px 4px', fontSize: '0.72em' }} aria-label="Editar">✏️</button>
        {!entry.active && (
          <button onClick={handleDelete} className="ib" style={{ padding: '2px 4px', fontSize: '0.72em', color: '#dc2626' }} aria-label="Excluir">🗑️</button>
        )}
      </div>
    </div>
  )
}

export default function TimeTrackingView({ workspace, profiles, currentProf, currentProfile, nonManagerProfiles, formatClock, formatMinutes, togglePause, stopTimer, startFavorite, removeFavorite, startCustomActivity, openModal, updateTimeEntry, deleteTimeEntry }) {
  if (currentProf === 'gestor') {
    return <ManagerTimeView nonManagerProfiles={nonManagerProfiles} profiles={profiles} formatClock={formatClock} formatMinutes={formatMinutes} />
  }
  return (
    <PersonalTimeView
      profile={currentProfile}
      formatClock={formatClock}
      formatMinutes={formatMinutes}
      togglePause={togglePause}
      stopTimer={stopTimer}
      startFavorite={startFavorite}
      removeFavorite={removeFavorite}
      startCustomActivity={startCustomActivity}
      openModal={openModal}
      updateTimeEntry={updateTimeEntry}
      deleteTimeEntry={deleteTimeEntry}
    />
  )
}

function ManagerTimeView({ nonManagerProfiles, formatClock, formatMinutes }) {
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
              <div className="gt-task">{tracking.cat}{tracking.sub ? ` → ${tracking.sub}` : ''}</div>
              <div className="gt-tmr" style={{ color: profile.color }}>{formatClock(tracking.seconds)}</div>
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
                <div className="pb-f" style={{ width: `${pct}%`, background: profile.color }} />
              </div>
              <span className="pb-v" style={{ color: profile.color }}>{formatMinutes(profile.tracking.totalMinutes)}</span>
            </div>
          )
        })}
      </div>
    </>
  )
}

function PersonalTimeView({ profile, formatClock, formatMinutes, togglePause, stopTimer, startFavorite, removeFavorite, startCustomActivity, openModal, updateTimeEntry, deleteTimeEntry }) {
  const tracking = profile.tracking
  const isActive = tracking.active && !tracking.paused
  const categories = profile.categories ?? []
  const favorites = profile.favorites ?? []

  return (
    <>
      <div style={{ background: 'linear-gradient(135deg,#1a1530,#2d2548)', borderRadius: 16, padding: '24px 16px', textAlign: 'center', marginBottom: 10, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 40%,rgba(124,106,239,0.08),transparent 70%)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '0.78em', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
            {isActive ? 'Rastreando agora' : tracking.paused ? 'Pausado' : 'Pronto para iniciar'}
          </div>
          <div style={{ width: 160, height: 160, margin: '12px auto', position: 'relative' }}>
            <svg width="160" height="160" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
              <circle cx="80" cy="80" r="70" fill="none" stroke={isActive ? profile.color : '#f59e0b'} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${isActive ? 310 : 200} 440`} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontFamily: "'Plus Jakarta Sans'", fontSize: '2.2em', fontWeight: 800, color: 'white', letterSpacing: '-0.02em' }}>
                {formatClock(tracking.seconds)}
              </div>
              <div style={{ fontSize: '0.72em', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
                {tracking.cat}{tracking.sub ? ` → ${tracking.sub}` : ''}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 8 }}>
            <button onClick={() => togglePause(profile.key)} aria-label={isActive ? 'Pausar' : 'Retomar'} style={{ width: 56, height: 56, borderRadius: '50%', border: 'none', background: isActive ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.2)', color: isActive ? '#fbbf24' : '#22c55e', fontSize: '1.5em', cursor: 'pointer' }}>
              {isActive ? '⏸' : '▶️'}
            </button>
            <button onClick={() => stopTimer(profile.key)} aria-label="Parar timer" style={{ width: 56, height: 56, borderRadius: '50%', border: 'none', background: 'rgba(239,68,68,0.15)', color: '#f87171', fontSize: '1.3em', cursor: 'pointer' }}>
              ⏹
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-t">
          ⚡ Favoritos de {profile.name}
          <button className="ib" style={{ marginLeft: 'auto' }} onClick={() => openModal('manage-fav')} aria-label="Gerenciar favoritos">⭐ Gerenciar</button>
        </div>
        {favorites.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '12px 8px' }}>
            <div style={{ fontSize: '2em', marginBottom: 6 }}>⭐</div>
            <div style={{ fontSize: '0.75em', color: 'var(--t3)', fontWeight: 600, marginBottom: 10 }}>
              Adicione atalhos para iniciar atividades rapidamente
            </div>
            <button
              className="save-btn"
              style={{ margin: '0 auto', display: 'block', padding: '8px 20px', fontSize: '0.8em' }}
              onClick={() => openModal('add-fav')}
              aria-label="Adicionar favorito"
            >
              ➕ Adicionar favorito
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
            {favorites.map((fav) => {
              const favActive = tracking.active && tracking.cat === fav.cat && (tracking.sub || '') === (fav.sub || '')
              return (
                <button key={fav.id} onClick={() => startFavorite(profile.key, fav.id)} aria-label={`Iniciar ${fav.label}`} style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px 6px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s', border: favActive ? `2px solid ${profile.color}` : '2px solid transparent', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <TwemojiImg emoji={fav.icon} size={26} />
                  <div style={{ fontSize: '0.68em', fontWeight: 700, marginTop: 4 }}>{fav.label}</div>
                  <span onClick={(e) => { e.stopPropagation(); removeFavorite(profile.key, fav.id) }} role="button" tabIndex={0} aria-label={`Remover ${fav.label}`} style={{ position: 'absolute', top: 2, left: 2, background: 'none', border: 'none', fontSize: '0.55em', cursor: 'pointer', opacity: 0.35, padding: 2 }}>
                    ✕
                  </span>
                </button>
              )
            })}
            <button onClick={() => openModal('add-fav')} aria-label="Adicionar favorito" style={{ background: 'transparent', border: '1.5px dashed var(--bd)', borderRadius: 10, padding: '10px 6px', textAlign: 'center', cursor: 'pointer' }}>
              <div style={{ fontSize: '1.3em', color: 'var(--t3)' }}>➕</div>
              <div style={{ fontSize: '0.68em', fontWeight: 700, color: 'var(--t3)', marginTop: 2 }}>Adicionar</div>
            </button>
          </div>
        )}

        {categories.length > 0 && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--bd)' }}>
            <div style={{ fontSize: '0.62em', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', marginBottom: 4 }}>Categorias</div>
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {categories.map((cat) => (
                <button className="ib" key={cat.id} onClick={() => startCustomActivity(profile.key, { cat: `${cat.icon} ${cat.name}`, sub: '', detail: '' })} aria-label={`Iniciar ${cat.name}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <TwemojiImg emoji={cat.icon} size={14} /> {cat.name}
                </button>
              ))}
              <button className="ib" onClick={() => openModal('category')} aria-label="Nova categoria">➕ Nova Categoria</button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-t">📋 Linha do Tempo — Hoje</div>
        {tracking.log.length > 0 ? (
          <>
            {tracking.log.map((entry) => (
              <TimelineEntry key={entry.id} entry={entry} profile={profile} formatMinutes={formatMinutes} updateTimeEntry={updateTimeEntry} deleteTimeEntry={deleteTimeEntry} />
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
          <div style={{ width: '44%', background: profile.color }} title={`${tracking.cat} ${formatMinutes(Math.floor(tracking.seconds / 60))}`} />
          <div style={{ width: '56%', background: 'var(--bd)' }} title={`Total ${formatMinutes(tracking.totalMinutes)}`} />
        </div>
      </div>
    </>
  )
}
