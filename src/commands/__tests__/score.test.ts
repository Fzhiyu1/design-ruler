import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import sharp from 'sharp'
import { classifyStatus, computeSsim, scoreImages, buildScoreOptions, score } from '../score.js'
import { generateHeatmap } from '../../score/heatmap.js'

async function solid(path: string, w: number, h: number, rgb: { r: number; g: number; b: number }) {
  await sharp({ create: { width: w, height: h, channels: 3, background: rgb } }).png().toFile(path)
}

describe('classifyStatus', () => {
  it('pass under 0.05', () => expect(classifyStatus(0.01)).toBe('pass'))
  it('warning between 0.05 and 0.15', () => expect(classifyStatus(0.10)).toBe('warning'))
  it('fail at or above 0.15', () => expect(classifyStatus(0.20)).toBe('fail'))
  it('boundary 0.05 is warning', () => expect(classifyStatus(0.05)).toBe('warning'))
  it('boundary 0.15 is fail', () => expect(classifyStatus(0.15)).toBe('fail'))
})

describe('computeSsim', () => {
  let tmp: string
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'dr-score-')) })
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }) })

  it('identical image → distance ~0', async () => {
    const p = join(tmp, 'a.png'); await solid(p, 64, 64, { r: 128, g: 128, b: 128 })
    const { ssim, distance } = await computeSsim(p, p)
    expect(distance).toBeLessThan(0.01)
    expect(ssim).toBeGreaterThan(0.99)
  })

  it('white vs black → large distance', async () => {
    const w = join(tmp, 'w.png'); const b = join(tmp, 'b.png')
    await solid(w, 64, 64, { r: 255, g: 255, b: 255 }); await solid(b, 64, 64, { r: 0, g: 0, b: 0 })
    const { distance } = await computeSsim(w, b)
    expect(distance).toBeGreaterThan(0.5)
  })

  it('different sizes → no throw, resizes a to b', async () => {
    const a = join(tmp, 'a.png'); const b = join(tmp, 'b.png')
    await solid(a, 32, 32, { r: 100, g: 100, b: 100 }); await solid(b, 80, 80, { r: 100, g: 100, b: 100 })
    const { distance } = await computeSsim(a, b)
    expect(distance).toBeLessThan(0.01)
  })
})

describe('generateHeatmap', () => {
  let tmp: string
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'dr-hm-')) })
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }) })

  it('writes a valid PNG sized to b', async () => {
    const a = join(tmp, 'a.png'); const b = join(tmp, 'b.png'); const hm = join(tmp, 'hm.png')
    await solid(a, 128, 128, { r: 255, g: 0, b: 0 }); await solid(b, 128, 128, { r: 0, g: 0, b: 255 })
    await generateHeatmap(a, b, hm)
    expect(existsSync(hm)).toBe(true)
    const meta = await sharp(hm).metadata()
    expect(meta.format).toBe('png')
    expect(meta.width).toBe(128)
    expect(meta.height).toBe(128)
  })

  it('resizes a to b and writes a heatmap sized to b', async () => {
    const a = join(tmp, 'a.png'); const b = join(tmp, 'b.png'); const hm = join(tmp, 'hm.png')
    await solid(a, 64, 64, { r: 255, g: 0, b: 0 }); await solid(b, 128, 128, { r: 0, g: 0, b: 255 })
    await generateHeatmap(a, b, hm)
    const meta = await sharp(hm).metadata()
    expect(meta.width).toBe(128)
    expect(meta.height).toBe(128)
  })
})

describe('scoreImages', () => {
  let tmp: string
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'dr-si-')) })
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }) })

  it('returns full result with status', async () => {
    const p = join(tmp, 'a.png'); await solid(p, 64, 64, { r: 128, g: 128, b: 128 })
    const r = await scoreImages(p, p)
    expect(r.distance).toBeLessThan(0.01)
    expect(r.status).toBe('pass')
    expect(r.a).toBe(p)
    expect(r.b).toBe(p)
  })

  it('writes heatmap only when a path is given', async () => {
    const a = join(tmp, 'a.png'); const b = join(tmp, 'b.png'); const hm = join(tmp, 'hm.png')
    await solid(a, 128, 128, { r: 255, g: 0, b: 0 }); await solid(b, 128, 128, { r: 0, g: 0, b: 255 })
    await scoreImages(a, b, hm)
    expect(existsSync(hm)).toBe(true)
    const none = join(tmp, 'none.png')
    await scoreImages(a, b)
    expect(existsSync(none)).toBe(false)
  })
})

describe('buildScoreOptions', () => {
  it('requires --a', () => expect(() => buildScoreOptions({ b: 'y' })).toThrow(/--a/))
  it('requires --b', () => expect(() => buildScoreOptions({ a: 'x' })).toThrow(/--b/))
  it('defaults format to json', () => expect(buildScoreOptions({ a: 'x', b: 'y' }).format).toBe('json'))
  it('accepts table format', () => expect(buildScoreOptions({ a: 'x', b: 'y', format: 'table' }).format).toBe('table'))
})

describe('score handler', () => {
  let tmp: string
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'dr-sh-')) })
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); vi.restoreAllMocks() })

  it('prints json result to stdout', async () => {
    const p = join(tmp, 'a.png'); await solid(p, 64, 64, { r: 128, g: 128, b: 128 })
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await score({ a: p, b: p })
    const out = JSON.parse(spy.mock.calls[0][0] as string)
    expect(out.status).toBe('pass')
    expect(out.distance).toBeLessThan(0.01)
  })

  it('prints a table line when format=table', async () => {
    const p = join(tmp, 'a.png'); await solid(p, 64, 64, { r: 128, g: 128, b: 128 })
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await score({ a: p, b: p, format: 'table' })
    const line = spy.mock.calls[0][0] as string
    expect(line).toContain('status=pass')
    expect(line).toContain('distance=')
  })
})
