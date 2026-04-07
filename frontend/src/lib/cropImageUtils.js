/** @param {string} url */
export function createImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (err) => reject(err))
    image.src = url
  })
}

/**
 * Recorta região quadrada da imagem (área do crop circular na UI).
 * @param {string} imageSrc data URL ou URL
 * @param {{ x: number, y: number, width: number, height: number }} pixelCrop
 * @param {number} outputSize lado do quadrado de saída
 */
export async function getCroppedImg(imageSrc, pixelCrop, outputSize = 512) {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  canvas.width = outputSize
  canvas.height = outputSize
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputSize,
    outputSize,
  )
  return canvas.toDataURL('image/jpeg', 0.88)
}
