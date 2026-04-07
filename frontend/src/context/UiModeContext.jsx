import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'tina_ui_mode_preference'
const LEGACY_KEY = 'tina_ui_mode'

/** Largura máxima (px) para usar shell mobile quando preferência = automático */
export const MOBILE_BREAKPOINT_PX = 900

const mqMobile = () => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`)

function mediaSaysMobile() {
  if (typeof window === 'undefined') return false
  return mqMobile().matches
}

function readPreference() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'auto' || v === 'tablet' || v === 'mobile') return v
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy === 'tablet' || legacy === 'mobile') return legacy
  } catch {
    /* ignore */
  }
  return 'auto'
}

const UiModeContext = createContext(null)

export function UiModeProvider({ children }) {
  const [preference, setPreferenceState] = useState(() => readPreference())
  const [mediaMobile, setMediaMobile] = useState(() =>
    typeof window !== 'undefined' ? mediaSaysMobile() : false,
  )

  useEffect(() => {
    const m = mqMobile()
    const handler = () => setMediaMobile(m.matches)
    m.addEventListener('change', handler)
    setMediaMobile(m.matches)
    return () => m.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, preference)
      localStorage.removeItem(LEGACY_KEY)
    } catch {
      /* ignore */
    }
  }, [preference])

  const mode = useMemo(() => {
    if (preference === 'tablet') return 'tablet'
    if (preference === 'mobile') return 'mobile'
    return mediaMobile ? 'mobile' : 'tablet'
  }, [preference, mediaMobile])

  const setPreference = useCallback((next) => {
    if (next === 'auto' || next === 'tablet' || next === 'mobile') {
      setPreferenceState(next)
    }
  }, [])

  /** Compat: força tablet ou mobile (equivale a setPreference sem auto) */
  const setMode = useCallback((next) => {
    setPreferenceState(next === 'mobile' ? 'mobile' : 'tablet')
  }, [])

  const toggleMode = useCallback(() => {
    setPreferenceState((p) => {
      if (p === 'auto') return mediaMobile ? 'tablet' : 'mobile'
      return p === 'mobile' ? 'tablet' : 'mobile'
    })
  }, [mediaMobile])

  const value = useMemo(
    () => ({
      mode,
      preference,
      setPreference,
      setMode,
      toggleMode,
      isMobile: mode === 'mobile',
      isTablet: mode === 'tablet',
      isAuto: preference === 'auto',
    }),
    [mode, preference, setPreference, setMode, toggleMode],
  )

  return <UiModeContext.Provider value={value}>{children}</UiModeContext.Provider>
}

export function useUiMode() {
  const ctx = useContext(UiModeContext)
  if (!ctx) {
    throw new Error('useUiMode deve ser usado dentro de UiModeProvider')
  }
  return ctx
}
