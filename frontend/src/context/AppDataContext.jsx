import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { api } from '../lib/api.js'
import { createDefaultWorkspace, formatClock, formatMinutes } from '../lib/seed.js'
import { loadWorkspace, saveWorkspace } from '../lib/storage.js'

const AppDataContext = createContext(null)

function mergeWorkspace(current, incoming) {
  const nextProfiles = incoming?.profiles ?? {}
  const nextCurrentProf = nextProfiles[current.currentProf] ? current.currentProf : incoming.currentProf

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
  const [syncState, setSyncState] = useState({ loading: false, error: '' })

  const loadRemoteWorkspace = useCallback(async () => {
    if (!user) {
      setWorkspace(createDefaultWorkspace())
      return
    }

    if (!token || user.role === 'super_admin') {
      const cachedWorkspace = loadWorkspace(user.id)
      setWorkspace(cachedWorkspace)
      return
    }

    setSyncState({ loading: true, error: '' })

    try {
      const payload = await api.dashboard(token)
      setWorkspace((current) => mergeWorkspace(current, payload.workspace))
      saveWorkspace(user.id, payload.workspace)
      setSyncState({ loading: false, error: '' })
    } catch (error) {
      const cachedWorkspace = loadWorkspace(user.id)
      setWorkspace(cachedWorkspace)
      setSyncState({ loading: false, error: error.message })
    }
  }, [token, user])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRemoteWorkspace()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [loadRemoteWorkspace])

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
          if (!profile?.tracking?.active || profile.tracking.paused) return

          changed = true
          const nextSeconds = profile.tracking.seconds + 1
          const nextLog = (profile.tracking.log ?? []).map((entry) =>
            entry.active
              ? {
                  ...entry,
                  durationMinutes: Math.max(1, Math.floor(nextSeconds / 60)),
                  time: `${entry.time.split('–')[0]}–agora`,
                }
              : entry,
          )

          nextProfiles[key] = {
            ...profile,
            tracking: {
              ...profile.tracking,
              seconds: nextSeconds,
              log: nextLog,
              totalMinutes: Math.max(profile.tracking.totalMinutes, Math.floor(nextSeconds / 60)),
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
        await reloadAfterMutation(() =>
          api.createCategory(token, {
            profileKey,
            icon,
            name,
            visibilityScope: Array.isArray(visibility) ? visibility : [visibility || 'Todos'],
          }),
        )
      },
      async addCalendarEvent({ eventDate, dayKey, title, time, members, cls, recurrenceType, recurrenceDays }) {
        await reloadAfterMutation(() =>
          api.createEvent(token, {
            eventDate: eventDate || '',
            dayKey: dayKey || '',
            title,
            time,
            members,
            cls: cls || 'ce-all',
            recurrenceType: recurrenceType || 'único',
            recurrenceDays: recurrenceDays || '',
          }),
        )
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
      async addMeal(meal) {
        await reloadAfterMutation(() => api.createMeal(token, meal))
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
        await reloadAfterMutation(() =>
          api.createFavorite(token, {
            profileKey,
            icon: favorite.icon,
            label: favorite.label,
            cat: favorite.cat,
            sub: favorite.sub,
            detail: favorite.detail,
            participantKeys: favorite.participantKeys || [profileKey],
          }),
        )
      },
      async removeFavorite(_profileKey, favoriteId) {
        await reloadAfterMutation(() => api.deleteFavorite(token, favoriteId))
      },
      async startCustomActivity(profileKey, payload) {
        await reloadAfterMutation(() =>
          api.startTimeEntry(token, {
            profileKey,
            cat: payload.cat,
            sub: payload.sub ?? '',
            detail: payload.detail ?? '',
          }),
        )
      },
      async startFavorite(profileKey, favoriteId) {
        const favorite = workspace.profiles[profileKey]?.favorites?.find((item) => item.id === favoriteId)
        if (!favorite) return
        await reloadAfterMutation(() =>
          api.startTimeEntry(token, {
            profileKey,
            cat: favorite.cat,
            sub: favorite.sub ?? '',
            detail: favorite.detail ?? '',
          }),
        )
      },
      async togglePause(profileKey) {
        await reloadAfterMutation(() => api.togglePauseTimeEntry(token, { profileKey }))
      },
      async stopTimer(profileKey) {
        await reloadAfterMutation(() => api.stopTimeEntry(token, { profileKey }))
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
