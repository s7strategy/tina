import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronRight, ChevronUp, Pause, Play, Square } from 'lucide-react'
import Modal from '../ui/Modal.jsx'
import { TwemojiImg } from '../ui/EmojiPicker.jsx'
import { FavOrCatIcon } from '../ui/FavOrCatIcon.jsx'
import { useUiMode } from '../../context/UiModeContext.jsx'
import { MOBILE_LIVE_STRIP_BASE_OFFSET_PX, MOBILE_NAV_BAR_OFFSET_PX } from '../../lib/mobileLayout.js'

const DIST_COLORS = ['#ff7a1a', '#2d9cdb', '#27ae60', '#e84393', '#7c6aef', '#e67e22', '#06b6d4']

function hexToRgba(hex, alpha) {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return `rgba(255,122,26,${alpha})`
  let v = hex.slice(1)
  if (v.length === 3) v = v.split('').map((c) => c + c).join('')
  const n = Number.parseInt(v, 16)
  if (Number.isNaN(n)) return `rgba(255,122,26,${alpha})`
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/** Fallback quando cat/sub/detail não vêm no payload (cache antigo): "Categoria — Nome · detalhe" */
function parseDisplayFromName(name) {
  if (!name || !String(name).trim()) return { primary: 'Atividade', secondary: null }
  const raw = String(name).trim()
  if (raw.includes(' — ')) {
    const parts = raw.split(/\s—\s/)
    if (parts.length >= 2) {
      const cat = parts[0].trim()
      const rest = parts.slice(1).join(' — ').trim()
      return { primary: rest, secondary: cat }
    }
  }
  return { primary: raw, secondary: null }
}

/** Donut: agrega só por categoria (nome da categoria no gráfico). */
function distributionCategoryKey(e) {
  const cat = (e.cat || '').trim()
  if (cat) return cat
  const raw = String(e.name || '').trim()
  if (raw.includes(' — ')) {
    const head = raw.split(/\s—\s/)[0].trim()
    if (head) return head
  }
  return raw || 'Outro'
}

/** Histórico: nome da tarefa em destaque; categoria entre parêntesis (outra cor). */
function historyRowDisplay(entry) {
  const cat = (entry.cat || '').trim()
  const sub = (entry.sub || '').trim()
  const detail = (entry.detail || '').trim()
  const taskName = [sub, detail].filter(Boolean).join(' · ')
  if (taskName) {
    return { name: taskName, category: cat || null }
  }
  const parsed = parseDisplayFromName(entry.name)
  if (parsed.secondary) {
    return { name: parsed.primary, category: parsed.secondary }
  }
  return { name: parsed.primary, category: cat || null }
}

function entryDurationSeconds(e) {
  if (e.active) return Math.max(0, Number(e.durationSeconds) || 0)
  const s = Number(e.durationSeconds)
  if (Number.isFinite(s) && s >= 0) return s
  return Math.max(0, (e.durationMinutes || 0) * 60)
}

/** `session` = tracking ou item de activeSessions ({ cat, sub, detail, favoriteId }). */
function pickIconEmojiForSession(profile, session) {
  const favs = profile.favorites ?? []
  const fid = session?.favoriteId
  if (fid) {
    const byId = favs.find((f) => f.id === fid)
    if (byId?.icon) return byId.icon
  }
  const match = favs.find(
    (f) =>
      f.cat === session?.cat &&
      (f.sub || '') === (session?.sub || '') &&
      (f.detail || '') === (session?.detail || ''),
  )
  if (match?.icon) return match.icon
  const cat = session?.cat || ''
  const g = cat.match(/\p{Extended_Pictographic}/u)
  return g?.[0] ?? '⏱'
}

function resolveFavoriteForSession(profile, session) {
  const favs = profile.favorites ?? []
  const fid = session?.favoriteId
  if (fid) {
    const byId = favs.find((f) => f.id === fid)
    if (byId) return byId
  }
  return (
    favs.find(
      (f) =>
        f.cat === session?.cat &&
        (f.sub || '') === (session?.sub || '') &&
        (f.detail || '') === (session?.detail || ''),
    ) ?? null
  )
}

function resolveCategoryForSession(profile, session) {
  const catStr = (session?.cat || '').trim()
  if (!catStr) return null
  return (profile.categories ?? []).find((c) => `${c.icon} ${c.name}`.trim() === catStr) ?? null
}

function SessionIcon({ profile, session, size }) {
  const fav = resolveFavoriteForSession(profile, session)
  if (fav?.iconImageUrl && fav.id) {
    return <FavOrCatIcon type="favorite" id={fav.id} emoji={fav.icon} hasCustomImage size={size} />
  }
  const catRow = resolveCategoryForSession(profile, session)
  if (catRow?.iconImageUrl && catRow.id) {
    return <FavOrCatIcon type="category" id={catRow.id} emoji={catRow.icon} hasCustomImage size={size} />
  }
  const iconEmoji = pickIconEmojiForSession(profile, session)
  return <TwemojiImg emoji={iconEmoji} size={size} />
}

/** Nome da tarefa em destaque; categoria por baixo (faixa ao vivo). */
function liveStripTitleLines(session) {
  const cat = (session.cat || '').trim()
  const sub = (session.sub || '').trim()
  const detail = (session.detail || '').trim()
  const nameParts = [sub, detail].filter(Boolean)
  if (nameParts.length > 0) {
    return { primary: nameParts.join(' · '), secondary: cat || null }
  }
  if (cat) return { primary: cat, secondary: null }
  return { primary: 'Atividade', secondary: null }
}

function isoToDatetimeLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function datetimeLocalToIso(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/** Fim para edição quando `endedAt` ainda não veio no payload (cache antigo). */
function entryEndIsoForEdit(entry) {
  if (entry.endedAt) return entry.endedAt
  if (entry.startedAt && entry.durationSeconds != null) {
    return new Date(new Date(entry.startedAt).getTime() + Number(entry.durationSeconds) * 1000).toISOString()
  }
  return null
}

function findFavoriteSession(fav, activeSessions) {
  const sessions = activeSessions ?? []
  return sessions.find((s) =>
    s.favoriteId
      ? s.favoriteId === fav.id
      : s.cat === fav.cat && (s.sub || '') === (fav.sub || '') && (s.detail || '') === (fav.detail || ''),
  )
}

/** Cache antigo sem `activeSessions`: reconstrói a partir do log. */
function normalizeActiveSessions(tracking) {
  const from = tracking.activeSessions
  if (Array.isArray(from) && from.length > 0) return from
  if (!tracking.active) return []
  const row = (tracking.log || []).find((e) => e.active)
  if (!row) return []
  return [
    {
      id: row.id,
      cat: row.cat ?? tracking.cat,
      sub: row.sub ?? tracking.sub,
      detail: row.detail ?? tracking.detail,
      favoriteId: row.favoriteId ?? tracking.favoriteId,
      paused: Boolean(row.paused ?? tracking.paused),
      seconds: Number(row.durationSeconds) || Number(tracking.seconds) || 0,
    },
  ]
}

function localYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function filterLogForHistoryDate(log, ymd, todayYmd) {
  return log.filter((e) => {
    if (e.active && ymd !== todayYmd) return false
    if (!e.startedAt) return ymd === todayYmd
    return localYmd(new Date(e.startedAt)) === ymd
  })
}

function sameLocalDayFromIso(iso, now) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  return localYmd(d) === localYmd(now)
}

function startOfWeekMonday(d) {
  const x = new Date(d)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}

function inStartedAtPeriod(startedAt, period, now) {
  if (!startedAt) return period === 'day'
  const d = new Date(startedAt)
  if (Number.isNaN(d.getTime())) return period === 'day'
  if (period === 'day') return sameLocalDayFromIso(startedAt, now)
  if (period === 'week') {
    const ws = startOfWeekMonday(now)
    const we = new Date(ws)
    we.setDate(we.getDate() + 7)
    return d >= ws && d < we
  }
  if (period === 'month') {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }
  return false
}

/** Texto da subcategoria na legenda: nome da tarefa + detalhe (quando ambos existem). */
function subcategoryDisplayLabel(e) {
  const sub = (e.sub || '').trim()
  const detail = (e.detail || '').trim()
  if (!sub && !detail) return null
  if (sub && detail) return `${sub} + ${detail}`
  return sub || detail
}

function subcategoryGroupKey(e) {
  const sub = (e.sub || '').trim()
  const detail = (e.detail || '').trim()
  return `${sub}\x00${detail}`
}

function buildDistribution(tracking, period, now = new Date()) {
  const log = tracking.log || []
  /** cat -> { totalMin, subs: Map<key, { label, min }>, emptyMin } */
  const catMap = new Map()

  for (const e of log) {
    if (!inStartedAtPeriod(e.startedAt, period, now)) continue
    const sec = entryDurationSeconds(e)
    const min = sec / 60
    if (min <= 0) continue
    const cat = distributionCategoryKey(e)
    const sub = (e.sub || '').trim()
    const detail = (e.detail || '').trim()
    const hasSub = Boolean(sub || detail)

    if (!catMap.has(cat)) {
      catMap.set(cat, { totalMin: 0, subs: new Map(), emptyMin: 0 })
    }
    const bucket = catMap.get(cat)
    bucket.totalMin += min

    if (hasSub) {
      const sk = subcategoryGroupKey(e)
      const label = subcategoryDisplayLabel(e)
      const prev = bucket.subs.get(sk) || { label, min: 0 }
      prev.min += min
      bucket.subs.set(sk, prev)
    } else {
      bucket.emptyMin += min
    }
  }

  for (const [, bucket] of catMap) {
    if (bucket.emptyMin > 0 && bucket.subs.size > 0) {
      const sk = '__empty__'
      const prev = bucket.subs.get(sk) || { label: 'Sem subcategoria', min: 0 }
      prev.min += bucket.emptyMin
      bucket.subs.set(sk, prev)
    }
  }

  const total = Array.from(catMap.values()).reduce((s, b) => s + b.totalMin, 0)
  if (total <= 0) return []

  return Array.from(catMap.entries())
    .filter(([, b]) => b.totalMin > 0)
    .map(([label, data], i) => {
      const subs = Array.from(data.subs.values())
        .filter((s) => s.min > 0)
        .sort((a, b) => b.min - a.min)
      return {
        label,
        min: data.totalMin,
        pct: (data.totalMin / total) * 100,
        color: DIST_COLORS[i % DIST_COLORS.length],
        subs,
      }
    })
}

function polar(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

function donutSegmentPath(cx, cy, rOut, rIn, startDeg, endDeg) {
  const startDegA = startDeg - 90
  const endDegA = endDeg - 90
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  const p1 = polar(cx, cy, rOut, startDegA)
  const p2 = polar(cx, cy, rOut, endDegA)
  const p3 = polar(cx, cy, rIn, endDegA)
  const p4 = polar(cx, cy, rIn, startDegA)
  return `M ${p1[0]} ${p1[1]} A ${rOut} ${rOut} 0 ${largeArc} 1 ${p2[0]} ${p2[1]} L ${p3[0]} ${p3[1]} A ${rIn} ${rIn} 0 ${largeArc} 0 ${p4[0]} ${p4[1]} Z`
}

function TimeDistributionDonut({ segments, totalMin, formatMinutes, light }) {
  const cx = 50
  const cy = 50
  const rOut = 44
  const rIn = 27
  let angle = 0
  const sum = segments.reduce((s, x) => s + x.min, 0) || 1
  const paths =
    segments.length > 0
      ? segments.map((seg, i) => {
          let sweep = (seg.min / sum) * 360
          if (segments.length === 1) sweep = Math.min(sweep, 359.999)
          const startDeg = angle
          const endDeg = angle + sweep
          angle = endDeg
          return (
            <path
              key={`${seg.label}-${i}`}
              d={donutSegmentPath(cx, cy, rOut, rIn, startDeg, endDeg)}
              fill={seg.color}
              stroke="rgba(0,0,0,0.2)"
              strokeWidth="0.35"
            />
          )
        })
      : null

  const emptyStroke = light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.14)'
  return (
    <div className={`time-track-donut-wrap${light ? ' time-track-donut-wrap--light' : ''}`}>
      <svg className="time-track-donut-svg" viewBox="0 0 100 100" width={200} height={200} aria-hidden>
        {segments.length === 0 ? (
          <circle cx={cx} cy={cy} r={(rOut + rIn) / 2} fill="none" stroke={emptyStroke} strokeWidth={rOut - rIn} />
        ) : (
          paths
        )}
      </svg>
      <div className={`time-track-donut-center${light ? ' time-track-donut-center--light' : ''}`}>
        {segments.length > 0 ? (
          <>
            <div className="time-track-donut-total">{formatMinutes(totalMin)}</div>
            <div className="time-track-donut-sub">no período</div>
          </>
        ) : (
          <>
            <div className="time-track-donut-total" style={{ fontSize: '0.95em', opacity: light ? 0.55 : 0.85 }}>
              —
            </div>
            <div className="time-track-donut-sub">Sem registros</div>
          </>
        )}
      </div>
    </div>
  )
}

function TimelineEntry({ entry, profile, formatMinutes, updateTimeEntry, deleteTimeEntry }) {
  const [mode, setMode] = useState('view')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const display = historyRowDisplay(entry)

  useEffect(() => {
    setEditStart(isoToDatetimeLocal(entry.startedAt))
    setEditEnd(isoToDatetimeLocal(entryEndIsoForEdit(entry)))
  }, [entry.id, entry.startedAt, entry.endedAt, entry.durationSeconds])

  async function handleSave() {
    const startedAt = datetimeLocalToIso(editStart)
    const endedAt = datetimeLocalToIso(editEnd)
    if (!startedAt || !endedAt) return
    await updateTimeEntry(entry.id, { startedAt, endedAt })
    setMode('view')
  }

  async function handleDelete() {
    if (entry.active) return
    await deleteTimeEntry(entry.id)
  }

  function openEdit() {
    setEditStart(isoToDatetimeLocal(entry.startedAt))
    setEditEnd(isoToDatetimeLocal(entryEndIsoForEdit(entry)))
    setMode('edit')
  }

  if (mode === 'edit') {
    return (
      <div style={{ padding: '8px 0', borderBottom: '1px solid var(--bd)' }}>
        <div style={{ fontSize: '0.65em', fontWeight: 800, color: 'var(--t3)', marginBottom: 6, letterSpacing: '0.04em' }}>INÍCIO E FIM</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: '0.68em', fontWeight: 600, color: 'var(--t2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            Início
            <input
              type="datetime-local"
              value={editStart}
              onChange={(e) => setEditStart(e.target.value)}
              style={{ fontSize: '0.78em', padding: '6px 8px', borderRadius: 8, border: '1.5px solid var(--brand)', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
            />
          </label>
          <label style={{ fontSize: '0.68em', fontWeight: 600, color: 'var(--t2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            Fim
            <input
              type="datetime-local"
              value={editEnd}
              onChange={(e) => setEditEnd(e.target.value)}
              style={{ fontSize: '0.78em', padding: '6px 8px', borderRadius: 8, border: '1.5px solid var(--brand)', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
            />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          <button type="button" className="ib" onClick={handleSave} style={{ color: 'var(--gn)', fontWeight: 700, fontSize: '0.78em' }}>
            ✓ Salvar
          </button>
          <button type="button" className="ib" onClick={() => setMode('view')} style={{ color: 'var(--t3)', fontSize: '0.78em' }}>
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--bd)', ...(entry.active ? { background: '#f0f9ff', borderRadius: 6, padding: '6px 8px', border: 'none', marginBottom: 2 } : {}) }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: entry.active ? 'var(--gn)' : profile.color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.8em', fontWeight: 700, color: 'var(--t1)', lineHeight: 1.35 }}>
          {display.name}
          {display.category ? (
            <span style={{ fontSize: '0.68em', fontWeight: 600, color: 'var(--t3)' }}> ({display.category})</span>
          ) : null}
        </div>
      </div>
      <div style={{ fontSize: '0.72em', color: 'var(--t3)', flexShrink: 0 }}>{entry.time}</div>
      <div style={{ fontFamily: "'Plus Jakarta Sans'", fontSize: '0.78em', fontWeight: 700, flexShrink: 0, width: 42, textAlign: 'right' }}>
        {formatMinutes((entry.durationSeconds != null ? entry.durationSeconds : (entry.durationMinutes || 0) * 60) / 60)}
      </div>
      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
        {!entry.active && (
          <button type="button" onClick={openEdit} className="ib" style={{ padding: '2px 4px', fontSize: '0.72em' }} aria-label="Editar horários de início e fim">
            ✏️
          </button>
        )}
        {!entry.active && (
          <button type="button" onClick={handleDelete} className="ib" style={{ padding: '2px 4px', fontSize: '0.72em', color: '#dc2626' }} aria-label="Excluir">
            🗑️
          </button>
        )}
      </div>
    </div>
  )
}

export default function TimeTrackingView({ workspace, profiles, currentProf, currentProfile, nonManagerProfiles, formatClock, formatMinutes, togglePause, stopTimer, startFavorite, removeFavorite, reorderFavorites, startCustomActivity, addManualTimeEntry, openModal, openCategoryForEdit, updateTimeEntry, deleteTimeEntry }) {
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
      reorderFavorites={reorderFavorites}
      startCustomActivity={startCustomActivity}
      addManualTimeEntry={addManualTimeEntry}
      openModal={openModal}
      openCategoryForEdit={openCategoryForEdit}
      updateTimeEntry={updateTimeEntry}
      deleteTimeEntry={deleteTimeEntry}
    />
  )
}

function ManagerTimeView({ nonManagerProfiles, formatClock, formatMinutes }) {
  return (
    <>
      <div className="time-track-gestor-hint" role="note" aria-label="Dica para ver o tempo por pessoa">
        <ChevronUp className="time-track-gestor-hint-ar" size={22} strokeWidth={2.35} aria-hidden />
        <p className="time-track-gestor-hint-txt">
          Para visualizar o tempo, escolha um membro da família acima.
        </p>
      </div>
      <div style={{ fontFamily: "'Plus Jakarta Sans'", fontWeight: 800, fontSize: '0.95em', marginBottom: 10 }}>
        ⏱️ Visão Geral — Família
      </div>
      <div className="g2" style={{ marginBottom: 10 }}>
        {nonManagerProfiles.map((profile) => {
          const tracking = profile.tracking
          const sessions = normalizeActiveSessions(tracking)
          const hasSess = sessions.length > 0
          const anyRun = hasSess && sessions.some((s) => !s.paused)
          const allPause = hasSess && sessions.every((s) => s.paused)
          const statusBg = hasSess && anyRun ? '#dcfce7' : allPause ? '#fef3c7' : '#f3f3f3'
          const statusFg = hasSess && anyRun ? '#16a34a' : allPause ? '#d97706' : '#999'
          const statusLabel = hasSess && anyRun ? '● Ativo' : allPause ? '⏸ Pausado' : '○ Idle'
          const primarySession = sessions[0] || tracking
          const { primary: mgrPri, secondary: mgrSec } = liveStripTitleLines(primarySession)
          const clockSec = sessions[0]?.seconds ?? tracking.seconds ?? 0
          const multi = sessions.length > 1 ? ` (+${sessions.length - 1})` : ''
          return (
            <div className="gt" key={profile.key}>
              <div className="gt-h">
                <div className="gt-av" style={{ background: profile.color }}>{profile.name[0]}</div>
                <div className="gt-nm">{profile.name}</div>
                <span className="gt-st" style={{ background: statusBg, color: statusFg }}>{statusLabel}</span>
              </div>
              <div className="gt-task">
                <div style={{ fontWeight: 700 }}>{mgrPri}{multi}</div>
                {mgrSec ? <div style={{ fontSize: '0.78em', fontWeight: 600, color: 'var(--t3)', marginTop: 2 }}>{mgrSec}</div> : null}
              </div>
              <div className="gt-tmr" style={{ color: profile.color }}>{formatClock(clockSec)}</div>
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

function PersonalTimeView({ profile, formatClock, formatMinutes, togglePause, stopTimer, startFavorite, removeFavorite, reorderFavorites = async () => {}, startCustomActivity, addManualTimeEntry, openModal, openCategoryForEdit = () => {}, updateTimeEntry, deleteTimeEntry }) {
  const { isMobile } = useUiMode()
  const [distPeriod, setDistPeriod] = useState('day')
  const [historyDate, setHistoryDate] = useState(() => localYmd(new Date()))
  const [manualOpen, setManualOpen] = useState(false)
  const [manualSource, setManualSource] = useState('cat')
  const [manualFavoriteId, setManualFavoriteId] = useState('')
  const [manualCategoryId, setManualCategoryId] = useState('')
  const [manualStart, setManualStart] = useState('')
  const [manualEnd, setManualEnd] = useState('')
  const [favLabelId, setFavLabelId] = useState(null)
  const [favDockExpanded, setFavDockExpanded] = useState(false)
  const [dragOverFavId, setDragOverFavId] = useState(null)
  const [donutLegendCollapsed, setDonutLegendCollapsed] = useState(() => new Set())
  const favPressRef = useRef({ timer: null, longFired: false })
  const catPressRef = useRef({ timer: null, longFired: false })
  const suppressNextTapRef = useRef(false)
  const suppressTapTimerRef = useRef(null)
  const tracking = profile.tracking
  const sessions = normalizeActiveSessions(tracking)
  const hasLiveSession = sessions.length > 0
  const anyRunning = hasLiveSession && sessions.some((s) => !s.paused)
  const allPaused = hasLiveSession && sessions.every((s) => s.paused)
  const categories = profile.categories ?? []
  const favorites = profile.favorites ?? []
  const favoritesRef = useRef(favorites)
  favoritesRef.current = favorites

  const manualDurationMin = useMemo(() => {
    const a = datetimeLocalToIso(manualStart)
    const b = datetimeLocalToIso(manualEnd)
    if (!a || !b) return null
    const sec = (new Date(b).getTime() - new Date(a).getTime()) / 1000
    if (!Number.isFinite(sec) || sec <= 0) return null
    return sec / 60
  }, [manualStart, manualEnd])

  function openManualModal() {
    const end = new Date()
    const start = new Date(end.getTime() - 60 * 60 * 1000)
    setManualStart(isoToDatetimeLocal(start.toISOString()))
    setManualEnd(isoToDatetimeLocal(end.toISOString()))
    if (categories.length > 0) {
      setManualSource('cat')
      setManualCategoryId(categories[0].id)
      setManualFavoriteId(favorites[0]?.id ?? '')
    } else if (favorites.length > 0) {
      setManualSource('fav')
      setManualFavoriteId(favorites[0].id)
      setManualCategoryId('')
    }
    setManualOpen(true)
  }

  async function submitManualEntry() {
    if (!addManualTimeEntry) return
    const startIso = datetimeLocalToIso(manualStart)
    const endIso = datetimeLocalToIso(manualEnd)
    if (!startIso || !endIso) {
      window.alert('Preenche data e hora de início e fim.')
      return
    }
    if (new Date(endIso) <= new Date(startIso)) {
      window.alert('O fim deve ser depois do início.')
      return
    }
    if (categories.length === 0 && favorites.length === 0) {
      window.alert('Cria pelo menos uma categoria ou um favorito para associar o tempo.')
      return
    }
    let payload
    if (manualSource === 'fav') {
      const fav = favorites.find((f) => f.id === manualFavoriteId)
      if (!fav) {
        window.alert('Escolhe um favorito.')
        return
      }
      const sub = (fav.sub || '').trim() || (fav.label || '').trim()
      payload = {
        profileKey: profile.key,
        cat: fav.cat,
        sub,
        detail: fav.detail ?? '',
        favoriteId: fav.id,
        startedAt: startIso,
        endedAt: endIso,
      }
    } else {
      const cat = categories.find((c) => c.id === manualCategoryId)
      if (!cat) {
        window.alert('Escolhe uma categoria.')
        return
      }
      payload = {
        profileKey: profile.key,
        cat: `${cat.icon} ${cat.name}`,
        sub: '',
        detail: '',
        startedAt: startIso,
        endedAt: endIso,
      }
    }
    const ok = await addManualTimeEntry(payload)
    if (ok) {
      setHistoryDate(localYmd(new Date(startIso)))
      setManualOpen(false)
    }
  }

  const todayYmd = localYmd(new Date())
  const distribution = useMemo(() => buildDistribution(tracking, distPeriod, new Date()), [tracking.log, distPeriod])
  const totalDistMin = useMemo(() => distribution.reduce((s, d) => s + d.min, 0), [distribution])

  const filteredHistoryLog = useMemo(
    () => filterLogForHistoryDate(tracking.log || [], historyDate, todayYmd),
    [tracking.log, historyDate, todayYmd],
  )

  const historyTotalMin = useMemo(() => {
    let sec = 0
    for (const e of filteredHistoryLog) {
      sec += entryDurationSeconds(e)
    }
    return sec / 60
  }, [filteredHistoryLog])

  useEffect(() => {
    if (!favLabelId) return
    const t = window.setTimeout(() => setFavLabelId(null), 4000)
    return () => window.clearTimeout(t)
  }, [favLabelId])

  useEffect(() => {
    setDonutLegendCollapsed(new Set())
  }, [distPeriod])

  const statusLabel = anyRunning ? 'Ao vivo' : allPaused ? 'Pausado' : 'Resumo do dia'

  function favoriteColIdFromPoint(clientX, clientY) {
    const stack = document.elementsFromPoint(clientX, clientY)
    if (!stack?.length) return null
    for (const node of stack) {
      if (!(node instanceof Element)) continue
      const col = node.closest?.('[data-fav-bubble-col]')
      const id = col?.getAttribute('data-fav-id')
      if (id) return id
    }
    return null
  }

  /** Reordenação por pointer (funciona em touch; o drag HTML5 não dispara em muitos móveis). */
  function attachFavoriteReorderTracking(pointerEvent, dragFavId) {
    if (!favDockExpanded) return
    const sx = pointerEvent.clientX
    const sy = pointerEvent.clientY
    const pointerId = pointerEvent.pointerId
    let dragging = false

    const remove = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
    }

    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return
      const dx = ev.clientX - sx
      const dy = ev.clientY - sy
      if (!dragging && dx * dx + dy * dy > 100) {
        dragging = true
        window.clearTimeout(favPressRef.current.timer)
        setDragOverFavId(dragFavId)
        try {
          ev.preventDefault()
        } catch (_) {
          /* noop */
        }
      }
      if (dragging) {
        try {
          ev.preventDefault()
        } catch (_) {
          /* noop */
        }
        const overId = favoriteColIdFromPoint(ev.clientX, ev.clientY)
        if (overId) setDragOverFavId(overId)
      }
    }

    const onEnd = (ev) => {
      if (ev.pointerId !== pointerId) return
      const wasDragging = dragging
      /* Suprimir tap de “iniciar” antes do pointerup na bolinha: o evento na window em captura corre antes do bubble do React. */
      if (wasDragging) {
        suppressNextTapRef.current = true
        window.clearTimeout(suppressTapTimerRef.current)
        suppressTapTimerRef.current = window.setTimeout(() => {
          suppressNextTapRef.current = false
        }, 450)
      }
      remove()
      if (!wasDragging) return
      const overId = favoriteColIdFromPoint(ev.clientX, ev.clientY)
      setDragOverFavId(null)
      if (overId && dragFavId !== overId) {
        const ids = favoritesRef.current.map((f) => f.id)
        const fromIdx = ids.indexOf(dragFavId)
        const toIdx = ids.indexOf(overId)
        if (fromIdx >= 0 && toIdx >= 0) {
          const next = [...ids]
          const [moved] = next.splice(fromIdx, 1)
          next.splice(toIdx, 0, moved)
          void reorderFavorites(profile.key, next)
        }
      }
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onEnd, true)
    window.addEventListener('pointercancel', onEnd, true)
  }

  const liveStripPortalTarget =
    typeof document !== 'undefined'
      ? isMobile
        ? document.getElementById('mobile-live-strip-host') || document.body
        : document.body
      : null

  const liveStripCount = sessions.length
  const mobileBottomPad = isMobile
    ? hasLiveSession
      ? `calc(${MOBILE_LIVE_STRIP_BASE_OFFSET_PX + liveStripCount * 72}px + env(safe-area-inset-bottom, 0px))`
      : `calc(${MOBILE_NAV_BAR_OFFSET_PX}px + env(safe-area-inset-bottom, 0px))`
    : undefined

  const liveStrip = hasLiveSession && liveStripPortalTarget
    ? createPortal(
        <div
          className={`time-track-live-stack${isMobile ? ' time-track-live-stack--mobile' : ' time-track-live-stack--tablet'}`}
          role="region"
          aria-label="Tarefas em andamento"
        >
          {sessions.map((session) => {
            const { primary: livePrimary, secondary: liveSecondary } = liveStripTitleLines(session)
            const running = !session.paused
            return (
              <div
                key={session.id}
                className={`time-track-live-strip${isMobile ? ' time-track-live-strip--mobile' : ' time-track-live-strip--tablet'}`}
              >
                <div className="time-track-live-left">
                  <div className="time-track-live-ico">
                    <SessionIcon profile={profile} session={session} size={26} />
                  </div>
                  <div className="time-track-live-text">
                    <span className="time-track-live-name">{livePrimary}</span>
                    {liveSecondary ? <span className="time-track-live-cat">{liveSecondary}</span> : null}
                    <span className="time-track-live-sub">
                      {session.paused ? 'Pausado · ' : ''}
                      {formatClock(session.seconds)}
                    </span>
                  </div>
                </div>
                <div className="time-track-live-actions">
                  <button
                    type="button"
                    className={running ? 'time-track-live-pause' : 'time-track-live-resume'}
                    onClick={() => togglePause(profile.key, session.id)}
                    aria-label={running ? 'Pausar' : 'Retomar'}
                  >
                    {running ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
                  </button>
                  <button type="button" className="time-track-live-stop" onClick={() => stopTimer(profile.key, session.id)} aria-label="Parar e salvar">
                    <Square size={18} fill="currentColor" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>,
        liveStripPortalTarget,
      )
    : null

  return (
    <>
      <div className="time-track-page" style={{ paddingBottom: mobileBottomPad }}>
        <div className="time-track-napper">
          <div className="time-track-hero time-track-hero--compact">
            <div className="time-track-hero-inner">
              <div className="time-track-status">{statusLabel}</div>
              <div className="time-track-hero-row-compact">
                <div className="time-track-period" role="tablist" aria-label="Período da distribuição">
                  {(['day', 'week', 'month']).map((p) => (
                    <button
                      key={p}
                      type="button"
                      role="tab"
                      aria-selected={distPeriod === p}
                      className={`time-track-period-btn${distPeriod === p ? ' is-on' : ''}`}
                      onClick={() => setDistPeriod(p)}
                    >
                      {p === 'day' ? 'Diária' : p === 'week' ? 'Semanal' : 'Mensal'}
                    </button>
                  ))}
                </div>
                {(categories.length > 0 || favorites.length > 0) && addManualTimeEntry ? (
                  <button
                    type="button"
                    className="time-track-manual-add"
                    onClick={openManualModal}
                    aria-label="Adicionar registo manual de tempo"
                    title="Registo manual"
                  >
                    +
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <div className="time-track-donut-card card">
            <div className="time-track-donut-card-inner">
              <TimeDistributionDonut segments={distribution} totalMin={totalDistMin} formatMinutes={formatMinutes} light />
              {distribution.length > 0 ? (
                <div className="time-track-donut-legend time-track-donut-legend--light">
                  {distribution.map((d, i) => {
                    const subs = d.subs ?? []
                    const hasSubs = subs.length > 0
                    const subsHidden = donutLegendCollapsed.has(d.label)
                    return (
                      <div key={`${d.label}-${i}`} className="time-track-donut-legend-group">
                        <div
                          className={`time-track-donut-legend-row${hasSubs ? ' time-track-donut-legend-row--parent' : ''}`}
                          role={hasSubs ? 'button' : undefined}
                          tabIndex={hasSubs ? 0 : undefined}
                          aria-expanded={hasSubs ? !subsHidden : undefined}
                          aria-label={hasSubs ? `${subsHidden ? 'Expandir' : 'Recolher'} subcategorias de ${d.label}` : undefined}
                          onClick={
                            hasSubs
                              ? () => {
                                  setDonutLegendCollapsed((prev) => {
                                    const n = new Set(prev)
                                    if (n.has(d.label)) n.delete(d.label)
                                    else n.add(d.label)
                                    return n
                                  })
                                }
                              : undefined
                          }
                          onKeyDown={
                            hasSubs
                              ? (ev) => {
                                  if (ev.key === 'Enter' || ev.key === ' ') {
                                    ev.preventDefault()
                                    setDonutLegendCollapsed((prev) => {
                                      const n = new Set(prev)
                                      if (n.has(d.label)) n.delete(d.label)
                                      else n.add(d.label)
                                      return n
                                    })
                                  }
                                }
                              : undefined
                          }
                        >
                          {hasSubs ? (
                            <span className="time-track-donut-legend-chev" aria-hidden>
                              {subsHidden ? <ChevronRight size={14} strokeWidth={2.5} /> : <ChevronDown size={14} strokeWidth={2.5} />}
                            </span>
                          ) : (
                            <span className="time-track-donut-legend-chev time-track-donut-legend-chev--spacer" aria-hidden />
                          )}
                          <span className="time-track-donut-dot" style={{ background: d.color }} />
                          <span className="time-track-donut-legend-label">
                            <span className="time-track-donut-pri">{d.label}</span>
                          </span>
                          <span className="time-track-donut-legend-val">{formatMinutes(d.min)}</span>
                        </div>
                        {hasSubs && !subsHidden
                          ? subs.map((s, j) => (
                              <div key={`${d.label}-sub-${j}`} className="time-track-donut-legend-row time-track-donut-legend-row--sub">
                                <span className="time-track-donut-legend-chev time-track-donut-legend-chev--spacer" aria-hidden />
                                <span className="time-track-donut-legend-sub-dot" style={{ background: d.color }} aria-hidden />
                                <span className="time-track-donut-legend-sublabel">{s.label}</span>
                                <span className="time-track-donut-legend-val time-track-donut-legend-val--sub">{formatMinutes(s.min)}</span>
                              </div>
                            ))
                          : null}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="time-track-donut-hint time-track-donut-hint--light">Registre atividades para ver a distribuição neste período.</div>
              )}
            </div>
          </div>
        </div>

        <div className="time-track-fav-wrap">
          <div className="time-track-executing-head">
            <span className="time-track-executing-title">TAREFAS EXECUTANDO</span>
            <span className="time-track-executing-hint">Até 3 ao mesmo tempo · toque para iniciar outra</span>
          </div>
          <div
            className={`time-track-fav-grid${favDockExpanded ? ' is-expanded' : ''}${favorites.length <= 1 ? ' time-track-fav-grid--no-toggle' : ''}`}
          >
            {favorites.length > 1 ? (
              <button
                type="button"
                className="time-track-fav-dock-toggle"
                onClick={() => setFavDockExpanded((v) => !v)}
                aria-expanded={favDockExpanded}
                aria-label={favDockExpanded ? 'Compactar lista de favoritos' : 'Abrir lista completa abaixo'}
              >
                {favDockExpanded ? <ChevronUp size={18} strokeWidth={2.5} /> : <ChevronDown size={18} strokeWidth={2.5} />}
              </button>
            ) : null}
            <div
              className={`time-track-bubbles-only time-track-bubbles-only--napper${favDockExpanded ? ' is-expanded' : ''}`}
              role="list"
              aria-label="Atividades favoritas"
            >
              {favorites.map((fav, fi) => {
                const sessionForFav = findFavoriteSession(fav, sessions)
                const favOn = Boolean(sessionForFav)
                const accent = profile.color || '#ff7a1a'
                const liveBubbleStyle = favOn
                  ? {
                      borderColor: accent,
                      background: 'var(--w)',
                      boxShadow: `0 10px 24px ${hexToRgba(accent, 0.32)}, 0 0 0 2px ${hexToRgba(accent, 0.42)}, 0 2px 8px rgba(0,0,0,0.06)`,
                    }
                  : undefined
                return (
                  <div
                    className={`time-track-bubble-col${dragOverFavId === fav.id ? ' is-drag-over' : ''}`}
                    key={fav.id}
                    data-fav-bubble-col
                    data-fav-id={fav.id}
                    style={{ zIndex: fi + 1 }}
                  >
                    {favLabelId === fav.id ? (
                      <div className="time-track-bubble-pop" role="tooltip">
                        {fav.label}
                      </div>
                    ) : null}
                    <div
                      role="button"
                      tabIndex={0}
                      className={`time-track-bubble${favOn ? ' time-track-bubble--live' : ''}${favDockExpanded ? ' time-track-bubble--draggable' : ''}`}
                      style={{
                        ...liveBubbleStyle,
                        touchAction: favDockExpanded ? 'none' : undefined,
                      }}
                      onPointerDown={(e) => {
                        if (favDockExpanded) attachFavoriteReorderTracking(e, fav.id)
                        favPressRef.current.longFired = false
                        favPressRef.current.timer = window.setTimeout(() => {
                          favPressRef.current.longFired = true
                          setFavLabelId(fav.id)
                        }, 480)
                      }}
                      onPointerUp={(e) => {
                        window.clearTimeout(favPressRef.current.timer)
                        if (suppressNextTapRef.current) {
                          e.preventDefault()
                          e.stopPropagation()
                          return
                        }
                        if (favPressRef.current.longFired) {
                          e.preventDefault()
                          return
                        }
                        startFavorite(profile.key, fav.id)
                      }}
                      onClick={(e) => {
                        if (suppressNextTapRef.current) {
                          e.preventDefault()
                          e.stopPropagation()
                        }
                      }}
                      onPointerLeave={() => window.clearTimeout(favPressRef.current.timer)}
                      onPointerCancel={() => window.clearTimeout(favPressRef.current.timer)}
                      onContextMenu={(e) => e.preventDefault()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          startFavorite(profile.key, fav.id)
                        }
                      }}
                      aria-label={favDockExpanded ? `Arrastar para reordenar ou iniciar ${fav.label}` : `Iniciar ${fav.label}`}
                    >
                      <FavOrCatIcon
                        type="favorite"
                        id={fav.id}
                        emoji={fav.icon}
                        hasCustomImage={Boolean(fav.iconImageUrl)}
                        size={favDockExpanded ? 24 : 22}
                      />
                      {favDockExpanded ? (
                        <button
                          type="button"
                          draggable={false}
                          className="time-track-bubble-rm"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeFavorite(profile.key, fav.id)
                          }}
                          aria-label={`Remover ${fav.label}`}
                        >
                          ✕
                        </button>
                      ) : null}
                    </div>
                    {favDockExpanded ? (
                      <span className="time-track-bubble-label" title={fav.label}>
                        {fav.label}
                      </span>
                    ) : null}
                    {favOn && sessionForFav ? (
                      <span className="time-track-bubble-timer" style={{ color: accent }}>
                        {formatClock(sessionForFav.seconds)}
                      </span>
                    ) : null}
                  </div>
                )
              })}
            </div>
            <button type="button" className="time-track-fav-add" onClick={() => openModal('add-fav')} aria-label="Adicionar favorito" title="Adicionar favorito">
              +
            </button>
          </div>
        </div>

        <div className="time-track-manage-row">
          <button type="button" className="time-track-manage-btn" onClick={() => openModal('manage-fav')}>
            Gerenciar favoritos
          </button>
        </div>

      {categories.length > 0 && (
        <div className="time-track-cats card" style={{ padding: 12 }}>
          <div className="card-t" style={{ marginBottom: 6 }}>
            Categorias
            <span className="time-track-cats-hint">Toque para iniciar · segure para editar</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {categories.map((cat) => (
              <button
                type="button"
                className="ib time-track-cat-chip"
                key={cat.id}
                onPointerDown={() => {
                  catPressRef.current.longFired = false
                  catPressRef.current.timer = window.setTimeout(() => {
                    catPressRef.current.longFired = true
                    openCategoryForEdit(cat)
                  }, 480)
                }}
                onPointerUp={(e) => {
                  window.clearTimeout(catPressRef.current.timer)
                  if (catPressRef.current.longFired) {
                    e.preventDefault()
                    return
                  }
                  startCustomActivity(profile.key, { cat: `${cat.icon} ${cat.name}`, sub: '', detail: '' })
                }}
                onPointerLeave={() => window.clearTimeout(catPressRef.current.timer)}
                onPointerCancel={() => window.clearTimeout(catPressRef.current.timer)}
                onContextMenu={(e) => e.preventDefault()}
                aria-label={`Iniciar ${cat.name}. Segure para editar.`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <FavOrCatIcon
                  type="category"
                  id={cat.id}
                  emoji={cat.icon}
                  hasCustomImage={Boolean(cat.iconImageUrl)}
                  size={14}
                />{' '}
                {cat.name}
              </button>
            ))}
            <button type="button" className="ib" onClick={() => openModal('category')} aria-label="Nova categoria">
              + Nova
            </button>
          </div>
        </div>
      )}

      <div className="time-track-hist-card">
        <div className="time-track-hist-head">
          <div className="time-track-hist-title">Histórico</div>
          <label className="time-track-hist-date">
            <span className="time-track-hist-date-lbl">Dia</span>
            <input
              type="date"
              className="time-track-hist-date-input"
              value={historyDate}
              max={todayYmd}
              onChange={(e) => setHistoryDate(e.target.value || todayYmd)}
            />
          </label>
        </div>
        {filteredHistoryLog.length > 0 ? (
          <>
            {filteredHistoryLog.map((entry) => (
              <TimelineEntry key={entry.id} entry={entry} profile={profile} formatMinutes={formatMinutes} updateTimeEntry={updateTimeEntry} deleteTimeEntry={deleteTimeEntry} />
            ))}
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '2px solid var(--bd)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82em', fontWeight: 700 }}>Total do dia</span>
              <span style={{ fontFamily: "'Plus Jakarta Sans'", fontWeight: 800, fontSize: '1.05em', color: profile.color }}>
                {formatMinutes(historyTotalMin)}
              </span>
            </div>
          </>
        ) : (
          <div className="empty-state" style={{ padding: '12px 0' }}>
            {historyDate === todayYmd ? 'Nenhuma atividade registrada neste dia.' : 'Nenhuma atividade neste dia.'}
          </div>
        )}
      </div>
      </div>

      <Modal
        isOpen={manualOpen}
        id="modal-time-manual"
        onClose={() => setManualOpen(false)}
        title="Registo manual"
      >
        <p className="meals-combos-hint" style={{ marginTop: 0 }}>
          Escolhe a mesma <strong>categoria</strong> ou <strong>favorito</strong> que usarias ao dar play. O tempo é
          calculado entre início e fim e entra no histórico e no gráfico como um registo normal.
        </p>
        {categories.length > 0 && favorites.length > 0 ? (
          <div className="radio-row" style={{ marginTop: 10, marginBottom: 8 }}>
            <label className="radio-opt">
              <input
                type="radio"
                checked={manualSource === 'cat'}
                onChange={() => {
                  setManualSource('cat')
                  if (categories[0]) setManualCategoryId(categories[0].id)
                }}
              />
              Categoria
            </label>
            <label className="radio-opt">
              <input
                type="radio"
                checked={manualSource === 'fav'}
                onChange={() => {
                  setManualSource('fav')
                  if (favorites[0]) setManualFavoriteId(favorites[0].id)
                }}
              />
              Favorito
            </label>
          </div>
        ) : null}
        {manualSource === 'cat' && categories.length > 0 ? (
          <label className="form-label" style={{ display: 'block', marginTop: 8 }}>
            Categoria
            <select
              className="sel"
              style={{ marginTop: 6, width: '100%' }}
              value={manualCategoryId}
              onChange={(e) => setManualCategoryId(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {manualSource === 'fav' && favorites.length > 0 ? (
          <label className="form-label" style={{ display: 'block', marginTop: 8 }}>
            Favorito
            <select
              className="sel"
              style={{ marginTop: 6, width: '100%' }}
              value={manualFavoriteId}
              onChange={(e) => setManualFavoriteId(e.target.value)}
            >
              {favorites.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: '0.72em', fontWeight: 700, color: 'var(--t3)' }}>
            Início
            <input
              type="datetime-local"
              className="meals-field"
              value={manualStart}
              onChange={(e) => setManualStart(e.target.value)}
              style={{ marginTop: 4, width: '100%', boxSizing: 'border-box' }}
            />
          </label>
          <label style={{ fontSize: '0.72em', fontWeight: 700, color: 'var(--t3)' }}>
            Fim
            <input
              type="datetime-local"
              className="meals-field"
              value={manualEnd}
              onChange={(e) => setManualEnd(e.target.value)}
              style={{ marginTop: 4, width: '100%', boxSizing: 'border-box' }}
            />
          </label>
        </div>
        <div
          style={{
            marginTop: 10,
            padding: '10px 12px',
            borderRadius: 12,
            background: 'var(--brand-gradient-soft)',
            border: '1px solid rgba(255,160,90,0.35)',
            fontSize: '0.85em',
            fontWeight: 800,
            color: 'var(--brand-dark)',
            textAlign: 'center',
          }}
        >
          Duração: {manualDurationMin != null ? formatMinutes(manualDurationMin) : '—'}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          <button type="button" className="save-btn" style={{ flex: '1 1 auto', minWidth: 140 }} onClick={submitManualEntry}>
            Adicionar
          </button>
          <button type="button" className="ib" style={{ flex: '1 1 auto' }} onClick={() => setManualOpen(false)}>
            Cancelar
          </button>
        </div>
      </Modal>

      {liveStrip}
    </>
  )
}
