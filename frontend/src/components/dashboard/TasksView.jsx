import { useState } from 'react'
import TaskHistoryView from './TaskHistoryView.jsx'

const PRIORITY_LABELS = ['', '🔵', '🟡', '🟠', '🔴', '🚨']

function timeLabel(task) {
  if (!task.timeType || task.timeType === 'none') return task.tag || ''
  if (task.timeType === 'shift') return task.timeValue || task.tag || ''
  if (task.timeType === 'time') return task.timeValue || task.tag || ''
  return task.tag || ''
}

function recurrenceLabel(recurrence) {
  if (!recurrence || recurrence === 'única') return ''
  if (recurrence.startsWith('dias:')) return '🔁 dias'
  return `🔁 ${recurrence}`
}

export default function TasksView({ workspace, profiles, currentProfile, nonManagerProfiles, openModal, updateTask, deleteTask, editTask }) {
  const isManager = workspace.currentProf === 'gestor'
  const targetProfiles = isManager ? nonManagerProfiles : [currentProfile]
  const [showHistory, setShowHistory] = useState(false)

  async function toggleTaskState(profileKey, task) {
    await updateTask(profileKey, task.id, { done: !task.done })
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <button
          className={`cb${!showHistory ? ' cb-bl' : ''}`}
          style={{ background: !showHistory ? undefined : 'var(--bg)', color: !showHistory ? undefined : 'var(--t3)' }}
          onClick={() => setShowHistory(false)}
        >
          ☑️ Tarefas
        </button>
        <button
          className={`cb${showHistory ? ' cb-bl' : ''}`}
          style={{ background: showHistory ? undefined : 'var(--bg)', color: showHistory ? undefined : 'var(--t3)' }}
          onClick={() => setShowHistory(true)}
        >
          📋 Histórico
        </button>
      </div>

      {showHistory ? (
        <TaskHistoryView profiles={profiles ?? workspace.profiles} currentProf={workspace.currentProf} />
      ) : (
        <div className={isManager ? 'g2' : ''}>
          {targetProfiles.map((profile) => {
            const done = profile.tasks?.filter((t) => t.done).length ?? 0
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
                {profile.tasks.map((task) => {
                  const tl = timeLabel(task)
                  const rec = recurrenceLabel(task.recurrence)
                  const participants = task.participantKeys || []
                  return (
                    <div className="ti" key={task.id}>
                      <button className={`ck${task.done ? ' d' : ''}`} onClick={() => toggleTaskState(profile.key, task)} aria-label={task.done ? 'Desmarcar tarefa' : 'Marcar como feita'}>
                        {task.done ? '✓' : ''}
                      </button>
                      <div className={`tl${task.done ? ' d' : ''}`}>{task.title}</div>
                      {task.priority > 0 && <span title={`Prioridade ${task.priority}`} style={{ fontSize: '0.75em', flexShrink: 0 }}>{PRIORITY_LABELS[task.priority]}</span>}
                      {task.reward && <div className="tp" title="Recompensa" style={{ color: 'var(--gn)' }}>🎁</div>}
                      {task.points > 0 && <div className="tp">+{task.points}⭐</div>}
                      {tl && <div className="tt">{tl}</div>}
                      {rec && <div className="tt" style={{ color: 'var(--mae)' }}>{rec}</div>}
                      {isManager && participants.length > 1 && (
                        <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                          {participants.slice(0, 3).map((k) => {
                            const p = workspace.profiles?.[k]
                            return p ? (
                              <div key={k} className="av" style={{ background: p.color, width: 14, height: 14, fontSize: '0.4em' }} title={p.name}>{p.name[0]}</div>
                            ) : null
                          })}
                        </div>
                      )}
                      <button className="ib" onClick={() => editTask(profile.key, task)} aria-label="Editar tarefa">✏️</button>
                      <button className="ib" onClick={() => deleteTask(profile.key, task.id)} aria-label="Excluir tarefa">✕</button>
                    </div>
                  )
                })}
                <div style={{ marginTop: 6, display: 'flex', gap: 3 }}>
                  <button className="ib" onClick={() => openModal('task', profile.key)} aria-label="Adicionar tarefa">➕ Tarefa</button>
                  <button className="ib" onClick={() => openModal('category')} aria-label="Gerenciar categorias">📂 Categorias</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
