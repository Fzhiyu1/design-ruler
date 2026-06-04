interface Rgba { data: Uint8ClampedArray; width: number; height: number }

async function loadRgba(path: string, w?: number, h?: number): Promise<Rgba> {
  const sharp = (await import('sharp')).default
  let pipe = sharp(path).ensureAlpha()
  if (w && h) pipe = pipe.resize(w, h, { fit: 'fill' })
  const { data, info } = await pipe.raw().toBuffer({ resolveWithObject: true })
  return {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  }
}

/** 提取 RGBA patch(4 通道)。 */
function extractPatch(img: Rgba, x: number, y: number, s: number): Uint8ClampedArray {
  const ch = 4
  const patch = new Uint8ClampedArray(s * s * ch)
  for (let row = 0; row < s; row++) {
    const src = ((y + row) * img.width + x) * ch
    patch.set(img.data.subarray(src, src + s * ch), row * s * ch)
  }
  return patch
}

/** 尽量每个维度 ≥3 个 patch;极小图回退到 ps=8(此时可能不足 3 个,由 generateHeatmap 的尺寸守卫兜底)。 */
function choosePatchSize(h: number, w: number): number {
  for (const ps of [64, 32, 16]) {
    if (Math.floor(h / ps) >= 3 && Math.floor(w / ps) >= 3) return ps
  }
  return Math.max(8, Math.min(Math.floor(h / 3), Math.floor(w / 3)))
}

/** 分块算 SSIM,上色(越红=结构差异越大),放大写出与 b 同尺寸的 PNG。 */
export async function generateHeatmap(aPath: string, bPath: string, outPath: string): Promise<void> {
  const sharp = (await import('sharp')).default
  const { ssim } = await import('ssim.js')
  const b = await loadRgba(bPath)
  if (b.width < 8 || b.height < 8) {
    throw new Error(`generateHeatmap: image too small (${b.width}x${b.height}), need ≥8px on each side`)
  }
  const a = await loadRgba(aPath, b.width, b.height)
  const ps = choosePatchSize(b.height, b.width)
  const rows = Math.floor(b.height / ps)
  const cols = Math.floor(b.width / ps)
  const grid = Buffer.alloc(rows * cols * 3)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ap = extractPatch(a, c * ps, r * ps, ps)
      const bp = extractPatch(b, c * ps, r * ps, ps)
      const { mssim } = ssim(
        { data: ap, width: ps, height: ps },
        { data: bp, width: ps, height: ps },
        { rgb2grayVersion: 'integer' },
      )
      const dist = Math.max(0, Math.min(1, 1 - mssim))
      const i = (r * cols + c) * 3
      grid[i] = Math.round(dist * 255)          // R: 差异越大越红
      grid[i + 1] = Math.round((1 - dist) * 180) // G: 越像越绿
      grid[i + 2] = 40                           // B: 固定低值
    }
  }
  await sharp(grid, { raw: { width: cols, height: rows, channels: 3 } })
    .resize(b.width, b.height, { kernel: 'nearest' })
    .png()
    .toFile(outPath)
}
