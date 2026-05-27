import { writeFile, mkdir } from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'

export interface BoxSpec { name: string; box: [number, number, number, number] }
export interface CropOptions {
  in: string
  boxes: BoxSpec[]
  outDir: string
  normalized: boolean
}
export interface CropResult {
  inputSize: [number, number]
  assets: Array<{ name: string; out: string; box: [number, number, number, number]; bytes: number }>
  skipped: Array<{ name: string; reason: string }>
}

/** Parse --boxes: inline JSON string or a path to a .json file. */
export function parseBoxes(raw: string): BoxSpec[] {
  const text = existsSync(raw) ? readFileSync(raw, 'utf-8') : raw
  const parsed = JSON.parse(text)
  if (!Array.isArray(parsed)) throw new Error('--boxes must be a JSON array of { name, box }')
  return parsed
}

export function buildCropOptions(raw: Record<string, any>): CropOptions {
  if (!raw.in) throw new Error('--in is required')
  if (raw.boxes == null) throw new Error('--boxes is required')
  return {
    in: raw.in,
    boxes: parseBoxes(raw.boxes),
    outDir: raw.outDir ?? '.',
    normalized: !!raw.normalized,
  }
}

/** Resolve a box to integer pixels within [0,0,W,H] (normalized → scaled; then clamped). */
export function resolveBox(
  box: [number, number, number, number],
  normalized: boolean,
  W: number,
  H: number,
): [number, number, number, number] {
  let [x, y, w, h] = box
  if (normalized) { x *= W; y *= H; w *= W; h *= H }
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h)
  x = Math.max(0, Math.min(x, W))
  y = Math.max(0, Math.min(y, H))
  w = Math.max(0, Math.min(w, W - x))
  h = Math.max(0, Math.min(h, H - y))
  return [x, y, w, h]
}

export async function cropAssets(opts: CropOptions): Promise<CropResult> {
  const sharp = (await import('sharp')).default
  const inputBuf = await sharp(opts.in).toBuffer()
  const meta = await sharp(inputBuf).metadata()
  const W = meta.width ?? 0
  const H = meta.height ?? 0
  const outDir = resolve(opts.outDir)
  await mkdir(outDir, { recursive: true })

  const assets: CropResult['assets'] = []
  const skipped: CropResult['skipped'] = []
  for (const b of opts.boxes) {
    const px = resolveBox(b.box, opts.normalized, W, H)
    const [x, y, w, h] = px
    if (w <= 0 || h <= 0) {
      skipped.push({ name: b.name, reason: 'box out of bounds or zero area' })
      continue
    }
    const out = join(outDir, `${b.name}.png`)
    const buf = await sharp(inputBuf).extract({ left: x, top: y, width: w, height: h }).png().toBuffer()
    await writeFile(out, buf)
    assets.push({ name: b.name, out, box: px, bytes: buf.length })
  }
  return { inputSize: [W, H], assets, skipped }
}

export async function crop(raw: Record<string, any>): Promise<void> {
  const result = await cropAssets(buildCropOptions(raw))
  console.log(JSON.stringify(result))
}
