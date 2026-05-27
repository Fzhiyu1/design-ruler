import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { resolveBox, parseBoxes, buildCropOptions, cropAssets } from '../crop.js'

let tmp: string
let img: string

async function makeImage(path: string, w: number, h: number) {
  const sharp = (await import('sharp')).default
  const buf = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 20, b: 30 } } }).png().toBuffer()
  writeFileSync(path, buf)
}

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'dr-crop-'))
  img = join(tmp, 'sheet.png')
  await makeImage(img, 100, 80)
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

describe('resolveBox', () => {
  it('converts normalized 0-1 to pixels', () => {
    expect(resolveBox([0, 0, 0.5, 0.5], true, 100, 80)).toEqual([0, 0, 50, 40])
  })
  it('passes pixel boxes through (rounded)', () => {
    expect(resolveBox([10, 5, 20, 30], false, 100, 80)).toEqual([10, 5, 20, 30])
  })
  it('clamps a box that runs past the edges', () => {
    expect(resolveBox([90, 70, 50, 50], false, 100, 80)).toEqual([90, 70, 10, 10])
  })
})

describe('parseBoxes', () => {
  it('parses inline JSON', () => {
    expect(parseBoxes('[{"name":"a","box":[0,0,1,1]}]')).toEqual([{ name: 'a', box: [0, 0, 1, 1] }])
  })
  it('parses a JSON file path', () => {
    const f = join(tmp, 'b.json')
    writeFileSync(f, '[{"name":"x","box":[1,2,3,4]}]')
    expect(parseBoxes(f)).toEqual([{ name: 'x', box: [1, 2, 3, 4] }])
  })
  it('throws when not an array', () => {
    expect(() => parseBoxes('{"name":"a"}')).toThrow()
  })
})

describe('buildCropOptions', () => {
  it('parses options', () => {
    const o = buildCropOptions({ in: img, boxes: '[{"name":"a","box":[0,0,1,1]}]', outDir: tmp, normalized: true })
    expect(o.in).toBe(img)
    expect(o.boxes).toEqual([{ name: 'a', box: [0, 0, 1, 1] }])
    expect(o.outDir).toBe(tmp)
    expect(o.normalized).toBe(true)
  })
  it('defaults outDir to "." and normalized to false', () => {
    const o = buildCropOptions({ in: img, boxes: '[]' })
    expect(o.outDir).toBe('.')
    expect(o.normalized).toBe(false)
  })
  it('throws if --in missing', () => {
    expect(() => buildCropOptions({ boxes: '[]' } as any)).toThrow(/in/i)
  })
})

describe('cropAssets', () => {
  it('crops normalized boxes into named PNG files of the right size', async () => {
    const outDir = join(tmp, 'out')
    const res = await cropAssets({ in: img, outDir, normalized: true, boxes: [
      { name: 'tl', box: [0, 0, 0.5, 0.5] },
      { name: 'full', box: [0, 0, 1, 1] },
    ] })
    expect(res.inputSize).toEqual([100, 80])
    expect(res.assets.map(a => a.name)).toEqual(['tl', 'full'])
    expect(existsSync(join(outDir, 'tl.png'))).toBe(true)
    const sharp = (await import('sharp')).default
    const m = await sharp(join(outDir, 'tl.png')).metadata()
    expect([m.width, m.height]).toEqual([50, 40])
    const mf = await sharp(join(outDir, 'full.png')).metadata()
    expect([mf.width, mf.height]).toEqual([100, 80])
  })
  it('skips a fully out-of-bounds box', async () => {
    const res = await cropAssets({ in: img, outDir: join(tmp, 'o2'), normalized: true, boxes: [
      { name: 'gone', box: [2, 2, 1, 1] },
    ] })
    expect(res.assets).toHaveLength(0)
    expect(res.skipped[0].name).toBe('gone')
  })
})
