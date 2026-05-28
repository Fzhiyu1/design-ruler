import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { findRuns, detectBoxes, autocrop } from '../autocrop.js'

describe('findRuns', () => {
  it('returns inclusive [start, end] runs of cells above minOn', () => {
    // counts: indices 0-1 on, 2-3 off, 4-6 on
    expect(findRuns([5, 5, 0, 0, 5, 5, 5], 1, 2)).toEqual([[0, 1], [4, 6]])
  })

  it('does not split on a gap shorter than minGap', () => {
    // single off cell at index 2, minGap 2 → stays one run
    expect(findRuns([5, 5, 0, 5, 5], 1, 2)).toEqual([[0, 4]])
  })

  it('treats cells at or below minOn as off (noise filtering)', () => {
    expect(findRuns([1, 1, 1], 1, 1)).toEqual([])
  })

  it('closes a trailing run at the last on-cell', () => {
    expect(findRuns([0, 0, 5, 5], 1, 1)).toEqual([[2, 3]])
  })
})

/** Build a grayscale buffer (255=white bg) with black (0) rects painted in. */
function synth(W: number, H: number, rects: Array<[number, number, number, number]>): Uint8Array {
  const g = new Uint8Array(W * H).fill(255)
  for (const [x, y, w, h] of rects)
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) g[yy * W + xx] = 0
  return g
}

const OPTS = { whiteThreshold: 240, minSize: 20 }

// A 2x2 icon grid with short label rows between/after. Gaps are >= 25px so the
// fixed minGap=20 separates icon rows from label rows. W=300, H=300.
const GRID: Array<[number, number, number, number]> = [
  [30, 20, 60, 60], [180, 20, 60, 60],   // icon row 1  (y 20-79)
  [30, 105, 60, 12], [180, 105, 60, 12], // label row 1 (y 105-116, short → dropped)
  [30, 142, 60, 60], [180, 142, 60, 60], // icon row 2  (y 142-201)
  [30, 227, 60, 12], [180, 227, 60, 12], // label row 2 (short → dropped)
]

describe('detectBoxes', () => {
  it('detects the icon cells in reading order, dropping label rows', () => {
    const boxes = detectBoxes(synth(300, 300, GRID), 300, 300, OPTS)
    expect(boxes).toEqual([
      { x: 30, y: 20, w: 60, h: 60 },
      { x: 180, y: 20, w: 60, h: 60 },
      { x: 30, y: 142, w: 60, h: 60 },
      { x: 180, y: 142, w: 60, h: 60 },
    ])
  })

  it('filters thin noise columns below minSize', () => {
    const withNoise: typeof GRID = [...GRID, [120, 20, 1, 60]] // 1px column in icon row 1
    const boxes = detectBoxes(synth(300, 300, withNoise), 300, 300, OPTS)
    expect(boxes).toHaveLength(4)
    expect(boxes.every((b) => b.w >= 20 && b.h >= 20)).toBe(true)
  })

  it('returns [] for an all-white image', () => {
    expect(detectBoxes(synth(300, 300, []), 300, 300, OPTS)).toEqual([])
  })

  it('keeps all bands when there are no label rows', () => {
    const boxes = detectBoxes(synth(300, 150, [[30, 20, 60, 60], [180, 20, 60, 60]]), 300, 150, OPTS)
    expect(boxes).toEqual([{ x: 30, y: 20, w: 60, h: 60 }, { x: 180, y: 20, w: 60, h: 60 }])
  })

  it('handles boxes touching the image edge (x=0, y=0)', () => {
    const boxes = detectBoxes(synth(300, 120, [[0, 0, 60, 60], [180, 0, 60, 60]]), 300, 120, OPTS)
    expect(boxes).toEqual([{ x: 0, y: 0, w: 60, h: 60 }, { x: 180, y: 0, w: 60, h: 60 }])
  })
})

describe('autocrop handler', () => {
  let tmp: string
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'dr-autocrop-')) })
  afterEach(() => rmSync(tmp, { recursive: true, force: true }))

  async function writeSheet(path: string, W: number, H: number, rects: Array<[number, number, number, number]>) {
    const sharp = (await import('sharp')).default
    const g = synth(W, H, rects)
    await sharp(Buffer.from(g), { raw: { width: W, height: H, channels: 1 } }).png().toFile(path)
  }

  it('writes boxes.json (pixel coords, padded names) and _overview.png', async () => {
    const sheet = join(tmp, 'sheet.png')
    await writeSheet(sheet, 300, 300, GRID)
    await autocrop({ in: sheet, outDir: tmp })

    expect(existsSync(join(tmp, '_overview.png'))).toBe(true)
    expect(statSync(join(tmp, '_overview.png')).size).toBeGreaterThan(0)
    const boxes = JSON.parse(readFileSync(join(tmp, 'boxes.json'), 'utf-8'))
    expect(boxes).toEqual([
      { name: '00', box: [30, 20, 60, 60] },
      { name: '01', box: [180, 20, 60, 60] },
      { name: '02', box: [30, 142, 60, 60] },
      { name: '03', box: [180, 142, 60, 60] },
    ])
  })

  it('throws when --in does not exist', async () => {
    await expect(autocrop({ in: join(tmp, 'nope.png'), outDir: tmp })).rejects.toThrow(/not found/)
  })

  it('requires --in', async () => {
    await expect(autocrop({ outDir: tmp })).rejects.toThrow(/required/)
  })

  it('prints {inputSize,count,boxes} JSON to stdout', async () => {
    const sheet = join(tmp, 'sheet.png')
    await writeSheet(sheet, 300, 300, GRID)
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await autocrop({ in: sheet, outDir: tmp })
    const out = JSON.parse(spy.mock.calls[0][0] as string)
    spy.mockRestore()
    expect(out.inputSize).toEqual([300, 300])
    expect(out.count).toBe(4)
    expect(out.boxes).toHaveLength(4)
  })

  it('writes empty boxes.json + overview and count 0 when nothing is detected', async () => {
    const sheet = join(tmp, 'blank.png')
    await writeSheet(sheet, 100, 100, []) // all white → no assets
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await autocrop({ in: sheet, outDir: tmp })
    const out = JSON.parse(spy.mock.calls[0][0] as string)
    spy.mockRestore()
    expect(out.count).toBe(0)
    expect(JSON.parse(readFileSync(join(tmp, 'boxes.json'), 'utf-8'))).toEqual([])
    expect(existsSync(join(tmp, '_overview.png'))).toBe(true)
  })
})
