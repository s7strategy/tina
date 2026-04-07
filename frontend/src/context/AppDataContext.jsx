import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { api } from '../lib/api.js'
import { createDefaultWorkspace, formatClock, formatMinutes } from '../lib/seed.js'
import { localCalendarYmd } from '../lib/localDate.js'
import { loadWorkspace, saveWorkspace } from '../lib/storage.js'

const AppDataContext = createContext(null)

function mergeWorkspace(current, incoming) {
  const nextProfiles = incoming?.profiles ?? {}
  const hasProf = (k) => k != null && Object.prototype.hasOwnProperty.call(nextProfiles, k)
  /** Prefer o perfil já selecionado se ainda existir (evita voltar ao gestor após cada sync). */
  const nextCurrentProf = hasProf(current.currentProf)
    ? current.currentProf
    : hasProf(incoming?.currentProf)
      ? incoming.currentProf
      : Object.keys(nextProfiles).find((k) => k !== 'gestor') || incoming?.currentProf || 'gestor'

  return {
    ...incoming,
    currentTab: current.currentTab ?? incoming.currentTab,
    currentView: current.currentView ?? incoming.currentView,
    currentProf: nextCurrentProf,
  }
}

export function AppDataProvider({ children }) {
  const { user, token } = useAuth()
  const [workspace, setWorkspace] = useState(createDefaultWorkspace())
  const [syncState, setSyncState] = useState({ loading: false, error: '', initialSyncDone: false })

  const loadRemoteWorkspace = useCallback(async () => {
    if (!user) {
      setWorkspace(createDefaultWorkspace())
      setSyncState({ loading: false, error: '', initialSyncDone: false })
      return
    }

    if (!token || user.role === 'super_admin') {
      const cachedWorkspace = loadWorkspace(user.id)
      setWorkspace(cachedWorkspace)
      setSyncState({ loading: false, error: '', initialSyncDone: true })
      return
    }

    setSyncState((prev) => ({ ...prev, loading: true, error: '' }))

    try {
      try {
        await api.rolloverTasks(token, { asOfDate: localCalendarYmd() })
      } catch {
        /* endpoint antigo / offline */
      }
      const payload = await api.dashboard(token, { today: localCalendarYmd() })
      setWorkspace((current) => mergeWorkspace(current, payload.workspace))
      saveWorkspace(user.id, payload.workspace)
      setSyncState({ loading: false, error: '', initialSyncDone: true })
    } catch (error) {
      const cachedWorkspace = loadWorkspace(user.id)
      setWorkspace(cachedWorkspace)
      setSyncState({ loading: false, error: error.message, initialSyncDone: true })
    }
  }, [token, user])

  useLayoutEffect(() => {
    void loadRemoteWorkspace()
  }, [loadRemoteWorkspace])

  const dayRef = useRef(localCalendarYmd())
  useEffect(() => {
    if (!user || user.role === 'super_admin' || !token) return undefined
    const tick = () => {
      const now = localCalendarYmd()
      if (now !== dayRef.current) {
        dayRef.current = now
        void loadRemoteWorkspace()
      }
    }
    const id = window.setInterval(tick, 60_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') tick()
    }
    const onFocus = () => tick()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onFocus)
    }
  }, [user, token, loadRemoteWorkspace])

  useEffect(() => {
    if (!user || user.role === 'super_admin') return
    saveWorkspace(user.id, workspace)
  }, [user, workspace])

  useEffect(() => {
    if (!user || user.role === 'super_admin') return

    const interval = window.setInterval(() => {
      setWorkspace((current) => {
        const nextProfiles = { ...current.profiles }
        let changed = false

        Object.keys(nextProfiles).forEach((key) => {
          const profile = nextProfiles[key]
          const log = profile?.tracking?.log
          if (!log?.length) return

          let profileChanged = false
          const nextLog = log.map((entry) => {
            if (!entry.active || entry.paused) return entry
            profileChanged = true
            const nextSeconds = (Number(entry.durationSeconds) || 0) + 1
            return {
              ...entry,
              durationSeconds: nextSeconds,
              durationMinutes: Math.floor(nextSeconds / 60),
              time: `${entry.time.split('–')[0]}–agora`,
            }
          })
          if (!profileChanged) return

          changed = true
          const activeSessions = (nextLog.filter((e) => e.active)
            .map((e) => ({
              id: e.id,
              cat: e.cat,
              sub: e.sub,
              detail: e.detail,
              favoriteId: e.favoriteId,
              paused: e.paused,
              seconds: e.durationSeconds,
            })))
          const primary = activeSessions[0]
          nextProfiles[key] = {
            ...profile,
            tracking: {
              ...profile.tracking,
              active: activeSessions.length > 0,
              paused: primary ? Boolean(primary.paused) : false,
              seconds: primary ? primary.seconds : 0,
              cat: primary?.cat ?? profile.tracking.cat,
              sub: primary?.sub ?? '',
              detail: primary?.detail ?? '',
              favoriteId: primary?.favoriteId ?? null,
              activeSessions,
              log: nextLog,
              totalMinutes: Math.floor(
                nextLog.reduce((s, e) => s + (Number(e.durationSeconds) || 0), 0) / 60,
              ),
            },
          }
        })

        return changed ? { ...current, profiles: nextProfiles } : current
      })
    }, 1000)

    return () => window.clearInterval(interval)
  }, [user])

  const reloadAfterMutation = useCallback(async (action) => {
    await action()
    await loadRemoteWorkspace()
  }, [loadRemoteWorkspace])

  const value = useMemo(
    () => ({
      workspace,
      syncState,
      async refreshWorkspace() {
        await loadRemoteWorkspace()
      },
      setCurrentTab(tab) {
        setWorkspace((current) => ({ ...current, currentTab: tab }))
      },
      setCurrentProf(profileKey) {
        setWorkspace((current) => ({ ...current, currentProf: profileKey }))
      },
      setCurrentView(view) {
        setWorkspace((current) => ({ ...current, currentView: view }))
      },
      async addTask({ profileKey, participants, title, timeType, timeValue, recurrence, priority, reward, points }) {
        await reloadAfterMutation(() =>
          api.createTask(token, {
            profileKey: profileKey || (participants && participants[0]) || '',
            participantKeys: participants || (profileKey ? [profileKey] : []),
            title,
            timeType: timeType || 'none',
            timeValue: timeValue || '',
            recurrence: recurrence || 'única',
            priority: Number(priority) || 0,
            reward: reward || '',
            points: Number(points) || 0,
            done: false,
            forDate: localCalendarYmd(),
          }),
        )
      },
      async updateTask(_profileKey, taskId, updates) {
        await reloadAfterMutation(() => api.updateTask(token, taskId, updates))
      },
      async deleteTask(_profileKey, taskId) {
        await reloadAfterMutation(() => api.deleteTask(token, taskId))
      },
      async addCategory({ profileKey, icon, name, visibility }) {
        const res = await api.createCategory(token, {
          profileKey,
          icon,
          name,
          visibilityScope: Array.isArray(visibility) ? visibility : [visibility || 'Todos'],
        })
        return res.category
      },
      async uploadCategoryIcon(categoryId, file) {
        await api.uploadCategoryIcon(token, categoryId, file)
        await loadRemoteWorkspace()
      },
      async deleteCategoryIcon(categoryId) {
        await api.deleteCategoryIcon(token, categoryId)
        await loadRemoteWorkspace()
      },
      async updateCategory(categoryId, { icon, name, visibility }) {
        const scope = Array.isArray(visibility) ? visibility : [visibility || 'Todos']
        await reloadAfterMutation(() =>
          api.updateCategory(token, categoryId, {
            icon,
            name,
            visibilityScope: scope,
          }),
        )
      },
      async deleteCategory(categoryId) {
        await reloadAfterMutation(() => api.deleteCategory(token, categoryId))
      },
      async addCalendarEvent({ eventDate, dayKey, title, time, members, cls, recurrenceType, recurrenceDays }) {
        await api.createEvent(token, {
          eventDate: eventDate || '',
          dayKey: dayKey || '',
          title,
          time,
          members,
          cls: cls || 'ce-all',
          recurrenceType: recurrenceType || 'único',
          recurrenceDays: recurrenceDays || '',
        })
        try {
          await loadRemoteWorkspace()
        } catch {
          /* evento já gravado; falha só no refresh do dashboard */
        }
      },
      async updateCalendarEvent(eventId, updates) {
        await reloadAfterMutation(() => api.updateEvent(token, eventId, updates))
      },
      async deleteCalendarEvent(eventId) {
        await reloadAfterMutation(() => api.deleteEvent(token, eventId))
      },
      async addReward({ tierId, value }) {
        await reloadAfterMutation(() => api.createReward(token, { tierId, value }))
      },
      async addProfile(profile) {
        await reloadAfterMutation(() =>
          api.createMember(token, {
            name: profile.name,
            relation: profile.relation,
            profileType: profile.profileType,
            age: profile.age,
            color: profile.color,
          }),
        )
      },
      async updateProfile(memberId, updates) {
        await reloadAfterMutation(() => api.updateMember(token, memberId, updates))
      },
      async fetchEventsDirect(params = {}) {
        return api.listEvents(token, params)
      },
      async fetchTaskHistory(params = {}) {
        return api.getTaskHistory(token, params)
      },
      async addFavorite(profileKey, favorite) {
        const res = await api.createFavorite(token, {
          profileKey,
          icon: favorite.icon,
          label: favorite.label,
          cat: favorite.cat,
          sub: favorite.sub,
          detail: favorite.detail,
          participantKeys: favorite.participantKeys || [profileKey],
        })
        if (favorite.iconFile && res?.favorite?.id) {
          await api.uploadFavoriteIcon(token, res.favorite.id, favorite.iconFile)
        }
        await loadRemoteWorkspace()
      },
      async removeFavorite(_profileKey, favoriteId) {
        await reloadAfterMutation(() => api.deleteFavorite(token, favoriteId))
      },
      async reorderFavorites(profileKey, favoriteIds) {
        await reloadAfterMutation(() => api.reorderFavorites(token, { profileKey, favoriteIds }))
      },
      async startCustomActivity(profileKey, payload) {
        try {
          await reloadAfterMutation(() =>
            api.startTimeEntry(token, {
              profileKey,
              cat: payload.cat,
              sub: payload.sub ?? '',
              detail: payload.detail ?? '',
            }),
          )
        } catch (e) {
          window.alert(e?.message || 'Não foi possível iniciar a atividade.')
        }
      },
      async addManualTimeEntry(payload) {
        try {
          await reloadAfterMutation(() => api.createManualTimeEntry(token, payload))
          return true
        } catch (e) {
          window.alert(e?.message || 'Não foi possível adicionar o registo.')
          return false
        }
      },
      async startFavorite(profileKey, favoriteId) {
        const favorite = workspace.profiles[profileKey]?.favorites?.find((item) => item.id === favoriteId)
        if (!favorite) return
        const sub = (favorite.sub || '').trim() || (favorite.label || '').trim()
        try {
          await reloadAfterMutation(() =>
            api.startTimeEntry(token, {
              profileKey,
              cat: favorite.cat,
              sub,
              detail: favorite.detail ?? '',
              favoriteId: favorite.id,
            }),
          )
        } catch (e) {
          window.alert(e?.message || 'Não foi possível iniciar o favorito.')
        }
      },
      async togglePause(profileKey, entryId) {
        await reloadAfterMutation(() => api.togglePauseTimeEntry(token, { profileKey, entryId }))
      },
      async stopTimer(profileKey, entryId) {
        await reloadAfterMutation(() => api.stopTimeEntry(token, { profileKey, entryId }))
      },
      async updateTimeEntry(entryId, updates) {
        await reloadAfterMutation(() => api.updateTimeEntry(token, entryId, updates))
      },
      async deleteTimeEntry(entryId) {
        await reloadAfterMutation(() => api.deleteTimeEntry(token, entryId))
      },
      formatClock,
      formatMinutes,
    }),
    [loadRemoteWorkspace, reloadAfterMutation, syncState, token, workspace],
  )

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData() {
  const context = useContext(AppDataContext)
  if (!context) {
    throw new Error('useAppData deve ser usado dentro de AppDataProvider')
  }
  return context
}
