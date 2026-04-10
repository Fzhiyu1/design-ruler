import sharp from 'sharp'

export type TintMode = 'magenta' | 'ghost' | 'difference'

/**
 * Process a design image for overlay compositing.
 *
 * Modes:
 * - 'magenta': Tint non-white pixels magenta (best for white/light backgrounds)
 * - 'ghost': Reduce opacity uniformly (works on any background color)
 * - 'difference': No preprocessing — caller should use 'difference' blend mode
 *
 * Returns a PNG buffer with alpha channel.
 */
export async function tintDesignImage(
  imagePath: string,
  mode: TintMode = 'auto' as any,
): Promise<Buffer> {
  const { data, info } = await sharp(imagePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const pixels = new Uint8Array(data.buffer)

  // Auto-detect: check if background is white/light
  const resolvedMode = mode === ('auto' as any) ? detectMode(pixels) : mode

  if (resolvedMode === 'magenta') {
    return tintMagenta(pixels, info)
  }

  if (resolvedMode === 'difference') {
    // Return as-is for difference blend
    return sharp(imagePath).ensureAlpha().png().toBuffer()
  }

  // ghost mode: uniform opacity reduction
  return tintGhost(pixels, info, 0.4)
}

function detectMode(pixels: Uint8Array): TintMode {
  // Sample corners + edges to detect background color
  // If most sampled pixels are bright (>220), use magenta mode
  // Otherwise use ghost mode
  let brightCount = 0
  const sampleSize = Math.min(pixels.length / 4, 1000)
  const step = Math.floor(pixels.length / 4 / sampleSize)

  for (let i = 0; i < sampleSize; i++) {
    const idx = i * step * 4
    const brightness = (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3
    if (brightness > 220) brightCount++
  }

  return (brightCount / sampleSize) > 0.5 ? 'magenta' : 'ghost'
}

const LIGHT_THRESHOLD = 230
const MAGENTA: [number, number, number] = [220, 40, 160]

function tintMagenta(
  pixels: Uint8Array,
  info: { width: number; height: number },
): Promise<Buffer> {
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

function tintGhost(
  pixels: Uint8Array,
  info: { width: number; height: number },
  opacity: number,
): Promise<Buffer> {
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i + 3] = Math.round(pixels[i + 3] * opacity)
  }

  return sharp(Buffer.from(pixels.buffer), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer()
}
