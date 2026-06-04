import { resolve } from 'path'

export type ScoreStatus = 'pass' | 'warning' | 'fail'

/** distance = 1 - ssim. pass <0.05 / warning <0.15 / fail ≥0.15 (沿用 design-verify 实战阈值)。 */
export function classifyStatus(distance: number): ScoreStatus {
  if (distance < 0.05) return 'pass'
  if (distance < 0.15) return 'warning'
  return 'fail'
}

interface Rgba { data: Uint8ClampedArray; width: number; height: number }

/** 加载为 RGBA raw;给了 w/h 就 resize(fit:fill 强制目标尺寸)。 */
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

/** SSIM of a vs b。a 被 resize 到 b 的尺寸(b 为尺寸基准)。 */
export async function computeSsim(aPath: string, bPath: string): Promise<{ ssim: number; distance: number }> {
  const { ssim } = await import('ssim.js')
  const b = await loadRgba(bPath)
  const a = await loadRgba(aPath, b.width, b.height)
  const { mssim } = ssim(
    { data: a.data, width: a.width, height: a.height },
    { data: b.data, width: b.width, height: b.height },
    { rgb2grayVersion: 'integer' },
  )
  return { ssim: +mssim.toFixed(4), distance: +(1 - mssim).toFixed(4) }
}

export interface ScoreResult { a: string; b: string; ssim: number; distance: number; status: ScoreStatus }

/** 编排:算 SSIM + 分级,给了 heatmapPath 就额外出热图。 */
export async function scoreImages(aPath: string, bPath: string, heatmapPath?: string): Promise<ScoreResult> {
  const { ssim, distance } = await computeSsim(aPath, bPath)
  if (heatmapPath) {
    const { generateHeatmap } = await import('../score/heatmap.js')
    await generateHeatmap(aPath, bPath, heatmapPath)
  }
  return { a: aPath, b: bPath, ssim, distance, status: classifyStatus(distance) }
}

export interface ScoreOptions { a: string; b: string; heatmap?: string; format: 'json' | 'table' }

export function buildScoreOptions(raw: Record<string, any>): ScoreOptions {
  if (!raw.a) throw new Error('--a is required')
  if (!raw.b) throw new Error('--b is required')
  return { a: raw.a, b: raw.b, heatmap: raw.heatmap, format: raw.format === 'table' ? 'table' : 'json' }
}

export async function score(raw: Record<string, any>): Promise<void> {
  const opts = buildScoreOptions(raw)
  const result = await scoreImages(
    resolve(opts.a),
    resolve(opts.b),
    opts.heatmap ? resolve(opts.heatmap) : undefined,
  )
  if (opts.format === 'table') {
    console.log(`ssim=${result.ssim}  distance=${result.distance}  status=${result.status}`)
  } else {
    console.log(JSON.stringify(result))
  }
}
