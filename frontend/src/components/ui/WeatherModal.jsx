import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import WeatherLucideIcon from './WeatherLucideIcon.jsx'
import { geocodeCityOpenMeteo, wmoEmoji, wmoLabelPt } from '../../lib/weather.js'

function formatDayLabel(isoDate) {
  if (!isoDate) return ''
  const d = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const that = new Date(d)
  that.setHours(0, 0, 0, 0)
  const diff = Math.round((that - today) / 86400000)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Amanhã'
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
}

export default function WeatherModal({ isOpen, onClose, weather }) {
  const { prefs, snapshot, loading, error, clearLocation } = weather

  const [cityQuery, setCityQuery] = useState('')
  const [searchHits, setSearchHits] = useState(null)
  const [citySearchError, setCitySearchError] = useState(null)

  useEffect(() => {
    if (!isOpen) {
      setCityQuery('')
      setSearchHits(null)
      setCitySearchError(null)
    }
  }, [isOpen])

  async function onSubmitCity(e) {
    e.preventDefault()
    setSearchHits(null)
    setCitySearchError(null)
    const q = cityQuery.trim()
    if (!q) return
    try {
      const j = await geocodeCityOpenMeteo(q)
      const list = j.results ?? []
      if (list.length === 0) {
        setSearchHits([])
        return
      }
      if (list.length === 1) {
        weather.pickCityFromResults(list[0])
        setCityQuery('')
        setSearchHits(null)
        return
      }
      setSearchHits(list)
    } catch {
      setSearchHits(null)
      setCitySearchError('Não foi possível buscar. Verifique a rede e tente de novo.')
    }
  }

  const daily = snapshot?.daily
  const times = daily?.time ?? []
  const current = snapshot?.current

  return (
    <Modal isOpen={isOpen} id="modal-weather" onClose={onClose} title="Clima">
      <div className="weather-modal">
        <p className="weather-modal-lead">
          Dados de{' '}
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            Open-Meteo
          </a>
          . Digite a cidade para ver a previsão.
        </p>

        <form className="weather-city-form" onSubmit={onSubmitCity}>
          <div className="form-label">Cidade</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="weather-city-input"
              placeholder="Ex: São Paulo, Lisboa, Porto"
              value={cityQuery}
              onChange={(e) => setCityQuery(e.target.value)}
            />
            <button type="submit" className="save-btn" disabled={loading || !cityQuery.trim()}>
              Buscar
            </button>
          </div>
        </form>

        {searchHits && searchHits.length > 0 ? (
          <div className="weather-search-hits">
            <div className="form-label">Escolha o lugar</div>
            <ul className="weather-search-list">
              {searchHits.map((r) => (
                <li key={`${r.latitude}-${r.longitude}-${r.name}`}>
                  <button
                    type="button"
                    className="weather-search-item"
                    onClick={() => {
                      weather.pickCityFromResults(r)
                      setCityQuery('')
                      setSearchHits(null)
                    }}
                  >
                    {[r.name, r.admin1, r.country].filter(Boolean).join(' — ')}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {searchHits && searchHits.length === 0 ? (
          <div className="feedback error" style={{ marginTop: 8 }}>
            Nenhum resultado. Tente outro nome.
          </div>
        ) : null}

        {citySearchError ? (
          <div className="feedback error" style={{ marginTop: 8 }}>
            {citySearchError}
          </div>
        ) : null}

        {prefs?.label ? (
          <div className="weather-location-bar">
            <span className="weather-location-label" title={prefs.label}>
              📌 {prefs.label}
            </span>
            <button type="button" className="ib" onClick={clearLocation}>
              Redefinir
            </button>
          </div>
        ) : null}

        {error ? <div className="feedback error weather-modal-err">{error}</div> : null}

        {loading && !snapshot ? <div className="weather-loading">A carregar…</div> : null}

        {current && prefs ? (
          <div className="weather-current">
            <WeatherLucideIcon code={current.weather_code} size={40} />
            <div>
              <div className="weather-current-temp">{Math.round(current.temperature_2m)}°C</div>
              <div className="weather-current-feels">
                Sensação {current.apparent_temperature != null ? `${Math.round(current.apparent_temperature)}°C` : '—'}
                {current.relative_humidity_2m != null ? ` · Umidade ${current.relative_humidity_2m}%` : ''}
              </div>
              <div className="weather-current-desc">{wmoLabelPt(current.weather_code)}</div>
            </div>
          </div>
        ) : null}

        {times.length > 0 && daily ? (
          <div className="weather-forecast">
            <div className="weather-forecast-title">Próximos 10 dias</div>
            <ul className="weather-forecast-list">
              {times.map((day, i) => {
                const w = daily.weather_code?.[i]
                const tmax = daily.temperature_2m_max?.[i]
                const tmin = daily.temperature_2m_min?.[i]
                return (
                  <li key={day} className="weather-forecast-row">
                    <span className="weather-forecast-day">{formatDayLabel(day)}</span>
                    <span className="weather-forecast-emoji" aria-hidden>
                      {wmoEmoji(w)}
                    </span>
                    <span className="weather-forecast-range">
                      {tmax != null && tmin != null
                        ? `${Math.round(tmax)}° / ${Math.round(tmin)}°`
                        : '—'}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        {!prefs && !loading ? (
          <p className="weather-modal-foot">Busque uma cidade acima para ver a previsão.</p>
        ) : null}
      </div>
    </Modal>
  )
}
