import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { sessionStorageService } from '../lib/storage.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => sessionStorageService.get())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function bootstrap() {
      if (!session?.token) {
        setLoading(false)
        return
      }

      try {
        const payload = await api.me(session.token)
        if (mounted) {
          const nextSession = { token: session.token, user: payload.user }
          setSession(nextSession)
          sessionStorageService.set(nextSession)
        }
      } catch {
        if (mounted) {
          setSession(null)
          sessionStorageService.clear()
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    bootstrap()
    return () => {
      mounted = false
    }
  }, [session?.token])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      token: session?.token ?? null,
      isAuthenticated: Boolean(session?.token),
      loading,
      async login(credentials) {
        const payload = await api.login(credentials)
        const nextSession = { token: payload.token, user: payload.user }
        setSession(nextSession)
        sessionStorageService.set(nextSession)
        return payload.user
      },
      async register(data) {
        const payload = await api.register(data)
        const nextSession = { token: payload.token, user: payload.user }
        setSession(nextSession)
        sessionStorageService.set(nextSession)
        return payload.user
      },
      logout() {
        setSession(null)
        sessionStorageService.clear()
      },
    }),
    [loading, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider')
  }
  return context
}
