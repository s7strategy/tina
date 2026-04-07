import { useEffect, useState } from 'react'
import { FavOrCatIcon } from './FavOrCatIcon.jsx'

/**
 * @param {'favorite' | 'category'} kind
 * @param {File | null} file
 * @param {(f: File | null) => void} onFileChange
 * @param {string} [entityId] — id existente (edição) para pré-visualizar imagem no servidor
 * @param {boolean} serverHasImage
 * @param {string} twemoji — emoji atual (fallback visual)
 * @param {() => Promise<void>} [onRemoveServerImage]
 */
export default function IconUploadRow({
  label = 'Imagem do ícone (opcional)',
  kind,
  file,
  onFileChange,
  entityId,
  serverHasImage,
  twemoji,
  onRemoveServerImage,
}) {
  const [localPreview, setLocalPreview] = useState(null)

  useEffect(() => {
    if (!file) {
      setLocalPreview(null)
      return undefined
    }
    const u = URL.createObjectURL(file)
    setLocalPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  const showServer = Boolean(!file && serverHasImage && entityId)

  function onPick(e) {
    const f = e.target.files?.[0]
    if (e.target) e.target.value = ''
    onFileChange(f || null)
  }

  async function onRemove() {
    if (file) {
      onFileChange(null)
      return
    }
    if (serverHasImage && onRemoveServerImage) await onRemoveServerImage()
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div className="form-label">{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
        <div style={{ flexShrink: 0 }}>
          {localPreview ? (
            <img
              src={localPreview}
              alt=""
              width={48}
              height={48}
              style={{ borderRadius: '50%', objectFit: 'cover', display: 'block' }}
            />
          ) : showServer ? (
            <FavOrCatIcon type={kind} id={entityId} emoji={twemoji} hasCustomImage size={48} />
          ) : (
            <FavOrCatIcon type={kind} id={entityId} emoji={twemoji} hasCustomImage={false} size={48} />
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
          <label className="ib" style={{ cursor: 'pointer' }}>
            📷 Escolher imagem
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }} onChange={onPick} />
          </label>
          {(file || serverHasImage) ? (
            <button type="button" className="ib" style={{ color: 'var(--rd)' }} onClick={onRemove}>
              ✕ Remover imagem
            </button>
          ) : null}
        </div>
      </div>
      <div style={{ fontSize: '0.65em', color: 'var(--t3)', marginTop: 4 }}>Até 2 MB · JPEG, PNG, WebP ou GIF</div>
    </div>
  )
}
