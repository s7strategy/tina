/** Códigos WMO (Open-Meteo). https://open-meteo.com/en/docs */
export function wmoLabelPt(code) {
  const c = Number(code)
  if (c === 0) return 'Céu limpo'
  if (c <= 3) return 'Nublado'
  if (c <= 48) return 'Neblina'
  if (c <= 57) return 'Chuvisco'
  if (c <= 67) return 'Chuva'
  if (c <= 77) return 'Neve'
  if (c <= 82) return 'Pancadas de chuva'
  if (c <= 86) return 'Pancadas de neve'
  if (c <= 99) return 'Tempestade'
  return 'Tempo'
}

export function wmoEmoji(code) {
  const c = Number(code)
  if (c === 0) return '☀️'
  if (c <= 3) return '⛅'
  if (c <= 48) return '🌫️'
  if (c <= 57) return '🌦️'
  if (c <= 67) return '🌧️'
  if (c <= 77) return '❄️'
  if (c <= 82) return '🌧️'
  if (c <= 86) return '❄️'
  if (c <= 99) return '⛈️'
  return '🌤️'
}

const STORAGE_KEY = 'tina_weather_v1'

export function loadWeatherPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (typeof p.lat === 'number' && typeof p.lon === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lon)) {
      return { lat: p.lat, lon: p.lon, label: typeof p.label === 'string' ? p.label : 'Local salvo', source: p.source === 'city' ? 'city' : 'geo' }
    }
  } catch {
    /* ignore */
  }
  return null
}

export function saveWeatherPrefs(prefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

export function clearWeatherPrefs() {
  localStorage.removeItem(STORAGE_KEY)
}

export async function fetchOpenMeteoForecast(lat, lon) {
  const u = new URL('https://api.open-meteo.com/v1/forecast')
  u.searchParams.set('latitude', String(lat))
  u.searchParams.set('longitude', String(lon))
  u.searchParams.set('current', 'temperature_2m,weather_code,relative_humidity_2m,apparent_temperature')
  u.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min')
  u.searchParams.set('timezone', 'auto')
  u.searchParams.set('forecast_days', '10')
  const r = await fetch(u.toString())
  if (!r.ok) throw new Error('Serviço de clima indisponível.')
  return r.json()
}

export async function geocodeCityOpenMeteo(query) {
  const u = new URL('https://geocoding-api.open-meteo.com/v1/search')
  u.searchParams.set('name', query.trim())
  u.searchParams.set('count', '8')
  u.searchParams.set('language', 'pt')
  u.searchParams.set('format', 'json')
  const r = await fetch(u.toString())
  if (!r.ok) throw new Error('Busca de cidade indisponível.')
  return r.json()
}
