import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { TwemojiImg } from './EmojiPicker.jsx'
import { API_BASE_URL } from '../../lib/api.js'

/** Imagem privada com token (GET /api/uploads/favorite|category/:id). */
function AuthImage({ kind, id, size, className }) {
  const { session } = useAuth()
  const token = session?.token
  const [src, setSrc] = useState(null)

  useEffect(() => {
    if (!token || !id) {
      setSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      return undefined
    }
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/uploads/${kind}/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (cancelled || !r.ok) return
        const blob = await r.blob()
        if (cancelled) return
        const blobUrl = URL.createObjectURL(blob)
        setSrc((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return blobUrl
        })
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
      setSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [token, kind, id])

  if (!src) {
    return (
      <span
        className={className}
        style={{
          width: size,
          height: size,
          display: 'inline-block',
          borderRadius: '50%',
          background: 'color-mix(in srgb, var(--t3) 18%, transparent)',
          flexShrink: 0,
        }}
        aria-hidden
      />
    )
  }
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: 'cover',
        borderRadius: '50%',
        flexShrink: 0,
        display: 'block',
      }}
    />
  )
}

/** Favorito ou categoria: foto própria ou emoji Twemoji. */
export function FavOrCatIcon({ type, id, emoji, hasCustomImage, size, className }) {
  const kind = type === 'favorite' ? 'favorite' : 'category'
  if (hasCustomImage && id) {
    return <AuthImage kind={kind} id={id} size={size} className={className} />
  }
  return <TwemojiImg emoji={emoji} size={size} className={className} />
}
