import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, resolve } from 'path'

/** Segment a 1-D projection into inclusive [start, end] runs of "on" cells.
 * A cell is "on" when its value > minOn. Runs separated by < minGap off-cells merge. */
export function findRuns(counts: number[], minOn: number, minGap: number): Array<[number, number]> {
  const runs: Array<[number, number]> = []
  let start = -1
  let lastOn = -1
  let gap = 0
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > minOn) {
      if (start < 0) start = i
      lastOn = i
      gap = 0
    } else if (start >= 0) {
      gap++
      if (gap >= minGap) { runs.push([start, lastOn]); start = -1; gap = 0 }
    }
  }
  if (start >= 0) runs.push([start, lastOn])
  return runs
}

export interface Box { x: number; y: number; w: number; h: number }
export interface DetectOptions { whiteThreshold: number; minSize: number }

/** Detect asset bounding boxes on a white-background grid sheet via projection
 * profiles. Returns boxes in reading order (top→bottom rows, left→right within). */
export function detectBoxes(
  gray: Uint8Array | Buffer,
  W: number,
  H: number,
  opts: DetectOptions,
): Box[] {
  const { whiteThreshold, minSize } = opts
  const fg = (x: number, y: number) => gray[y * W + x] < whiteThreshold

  const rowCount = new Array<number>(H)
  for (let y = 0; y < H; y++) {
    let c = 0
    for (let x = 0; x < W; x++) if (fg(x, y)) c++
    rowCount[y] = c
  }
  const bands = findRuns(rowCount, Math.round(W * 0.012), 20)
  if (bands.length === 0) return []

  // Drop label rows: keep only bands at least half as tall as the tallest band.
  // (A single-band sheet keeps that band unconditionally — relies on the documented
  // white-background grid precondition; see autocrop spec's boundary note.)
  const maxBandH = Math.max(...bands.map(([a, b]) => b - a))
  const iconBands = bands.filter(([a, b]) => b - a >= maxBandH * 0.5)

  const boxes: Box[] = []
  for (const [y0, y1] of iconBands) {
    const colCount = new Array<number>(W)
    for (let x = 0; x < W; x++) {
      let c = 0
      for (let y = y0; y <= y1; y++) if (fg(x, y)) c++
      colCount[x] = c
    }
    const cells = findRuns(colCount, Math.round((y1 - y0) * 0.03), Math.round(W * 0.01))
    for (const [x0, x1] of cells) {
      let bx0 = x1, bx1 = x0, by0 = y1, by1 = y0
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++)
          if (fg(x, y)) {
            if (x < bx0) bx0 = x
            if (x > bx1) bx1 = x
            if (y < by0) by0 = y
            if (y > by1) by1 = y
          }
      const w = bx1 - bx0 + 1
      const h = by1 - by0 + 1
      if (w >= minSize && h >= minSize) boxes.push({ x: bx0, y: by0, w, h })
    }
  }
  return boxes
}

export interface NamedBox { name: string; box: [number, number, number, number] }

/** CLI handler: read a sheet, detect boxes, write boxes.json + numbered _overview.png. */
export async function autocrop(raw: Record<string, any>): Promise<void> {
  const inPath = raw.in
  if (!inPath) throw new Error('--in is required')
  if (!existsSync(inPath)) throw new Error(`input not found: ${inPath}`)
  const whiteThreshold = Number(raw.whiteThreshold ?? 240)
  const minSize = Number(raw.minSize ?? 20)
  const outDir = resolve(raw.outDir ?? '.')

  const sharp = (await import('sharp')).default
  const { data, info } = await sharp(inPath).grayscale().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  const H = info.height
  const boxes = detectBoxes(data, W, H, { whiteThreshold, minSize })

  await mkdir(outDir, { recursive: true })
  const named: NamedBox[] = boxes.map((b, i) => ({
    name: String(i).padStart(2, '0'),
    box: [b.x, b.y, b.w, b.h],
  }))
  await writeFile(join(outDir, 'boxes.json'), JSON.stringify(named, null, 2))

  const svg =
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
    boxes
      .map(
        (b, i) =>
          `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="red" stroke-width="3"/>` +
          `<text x="${b.x + 2}" y="${b.y + 16}" font-size="16" fill="red" font-family="sans-serif">${i}</text>`,
      )
      .join('') +
    `</svg>`
  await sharp(inPath).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toFile(join(outDir, '_overview.png'))

  console.log(JSON.stringify({ inputSize: [W, H], count: boxes.length, boxes: named }))
}
