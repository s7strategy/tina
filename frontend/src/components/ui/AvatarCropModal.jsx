import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { getCroppedImg, createImage } from '../../lib/cropImageUtils.js'

export default function AvatarCropModal({ imageSrc, onClose, onConfirm }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)

  const onCropComplete = useCallback((_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  const handleConfirm = async () => {
    try {
      let pixels = croppedAreaPixels
      if (!pixels) {
        const image = await createImage(imageSrc)
        const side = Math.min(image.width, image.height)
        const x = (image.width - side) / 2
        const y = (image.height - side) / 2
        pixels = { x, y, width: side, height: side }
      }
      const dataUrl = await getCroppedImg(imageSrc, pixels, 512)
      onConfirm(dataUrl)
    } catch {
      onClose()
    }
  }

  return (
    <div className="avatar-crop-bg" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title">
      <div className="avatar-crop-panel">
        <h2 id="avatar-crop-title" className="avatar-crop-title">
          Ajustar foto do perfil
        </h2>
        <p className="avatar-crop-hint">Arraste para posicionar e use o zoom. O círculo mostra o recorte final.</p>
        <div className="avatar-crop-stage">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="avatar-crop-zoom">
          <span className="avatar-crop-zoom-label">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.02}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom da imagem"
          />
        </div>
        <div className="avatar-crop-actions">
          <button type="button" className="avatar-crop-btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="avatar-crop-btn primary" onClick={handleConfirm}>
            Usar esta foto
          </button>
        </div>
      </div>
    </div>
  )
}
