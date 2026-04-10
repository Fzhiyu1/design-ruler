import sharp from 'sharp'
import { readFile } from 'fs/promises'

const LIGHT_THRESHOLD = 230
const MAGENTA: [number, number, number] = [220, 40, 160]

/**
 * Tint a design image for ghost overlay:
 * - White/light pixels → transparent (no background pollution)
 * - Dark/colored pixels → magenta, opacity proportional to darkness
 *
 * Returns a PNG buffer with alpha channel.
 */
export async function tintDesignImage(imagePath: string): Promise<Buffer> {
  const { data, info } = await sharp(imagePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const pixels = new Uint8Array(data.buffer)

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2]
    const brightness = (r + g + b) / 3

    if (brightness > LIGHT_THRESHOLD) {
      pixels[i + 3] = 0
    } else {
      const darkness = 1 - brightness / 255
      pixels[i] = MAGENTA[0]
      pixels[i + 1] = MAGENTA[1]
      pixels[i + 2] = MAGENTA[2]
      pixels[i + 3] = Math.round(darkness * 200)
    }
  }

  return sharp(Buffer.from(pixels.buffer), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer()
}
