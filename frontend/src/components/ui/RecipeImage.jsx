import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { API_BASE_URL } from '../../lib/api.js'

/** Foto da receita (GET /api/uploads/recipe/:id). */
export default function RecipeImage({ recipeId, size = 56, className }) {
  const { session } = useAuth()
  const token = session?.token
  const [src, setSrc] = useState(null)

  useEffect(() => {
    if (!token || !recipeId) {
      setSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      return undefined
    }
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/uploads/recipe/${recipeId}`, {
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
  }, [token, recipeId])

  if (!src) {
    return (
      <span
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: 12,
          background: 'color-mix(in srgb, var(--t3) 15%, transparent)',
          display: 'inline-block',
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
      style={{ width: size, height: size, objectFit: 'cover', borderRadius: 12, flexShrink: 0 }}
      className={className}
    />
  )
}
