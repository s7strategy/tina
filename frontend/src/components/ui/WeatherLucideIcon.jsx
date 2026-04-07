import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun } from 'lucide-react'

/** Ícone coerente com código WMO (Open-Meteo). */
export default function WeatherLucideIcon({ code, size = 28, strokeWidth = 1.75, className }) {
  const c = Number(code)
  let Icon = CloudSun
  if (c === 0) Icon = Sun
  else if (c <= 3) Icon = CloudSun
  else if (c <= 48) Icon = CloudFog
  else if (c <= 57) Icon = CloudRain
  else if (c <= 67) Icon = CloudRain
  else if (c <= 77) Icon = CloudSnow
  else if (c <= 86) Icon = CloudRain
  else if (c <= 99) Icon = CloudLightning
  else Icon = Cloud

  return (
    <span className={className ?? 'wt-ic-svg'} aria-hidden>
      <Icon size={size} strokeWidth={strokeWidth} />
    </span>
  )
}
