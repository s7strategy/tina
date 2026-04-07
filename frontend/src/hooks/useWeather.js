import { useCallback, useEffect, useState } from 'react'
import {
  clearWeatherPrefs,
  fetchOpenMeteoForecast,
  loadWeatherPrefs,
  saveWeatherPrefs,
} from '../lib/weather.js'

/**
 * Clima via Open-Meteo (sem chave). Local definido por cidade (geocoding).
 */
export function useWeather() {
  const [prefs, setPrefs] = useState(() => loadWeatherPrefs())
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchForecast = useCallback(async (lat, lon) => {
    setLoading(true)
    setError(null)
    try {
      const j = await fetchOpenMeteoForecast(lat, lon)
      setSnapshot({ current: j.current, daily: j.daily })
    } catch (e) {
      setError(e?.message || 'Não foi possível carregar o clima.')
      setSnapshot(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (prefs?.lat != null && prefs?.lon != null) {
      fetchForecast(prefs.lat, prefs.lon)
    } else {
      setSnapshot(null)
    }
  }, [prefs?.lat, prefs?.lon, fetchForecast])

  useEffect(() => {
    if (!prefs?.lat || !prefs?.lon) return undefined
    const id = window.setInterval(() => {
      fetchForecast(prefs.lat, prefs.lon)
    }, 30 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [prefs?.lat, prefs?.lon, fetchForecast])

  const applyCityResult = useCallback((first) => {
    const label = [first.name, first.admin1, first.country].filter(Boolean).join(' — ')
    const next = {
      lat: first.latitude,
      lon: first.longitude,
      label: label || 'Cidade',
      source: 'city',
    }
    saveWeatherPrefs(next)
    setPrefs(next)
    setError(null)
  }, [])

  const pickCityFromResults = useCallback(
    (result) => {
      applyCityResult(result)
    },
    [applyCityResult],
  )

  const refresh = useCallback(() => {
    if (prefs?.lat != null && prefs?.lon != null) fetchForecast(prefs.lat, prefs.lon)
  }, [prefs?.lat, prefs?.lon, fetchForecast])

  const clearLocation = useCallback(() => {
    clearWeatherPrefs()
    setPrefs(null)
    setSnapshot(null)
    setError(null)
  }, [])

  return {
    prefs,
    snapshot,
    loading,
    error,
    pickCityFromResults,
    refresh,
    clearLocation,
  }
}
