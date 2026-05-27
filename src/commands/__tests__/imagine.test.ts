import { describe, it, expect } from 'vitest'
import { buildImagineOptions } from '../imagine.js'

describe('buildImagineOptions', () => {
  it('defaults to generate mode with medium quality', () => {
    const o = buildImagineOptions('a cat', { out: 'x.png' })
    expect(o.mode).toBe('generate')
    expect(o.quality).toBe('medium')
    expect(o.out).toBe('x.png')
  })

  it('switches to edit mode when --ref present', () => {
    const o = buildImagineOptions('p', { ref: 'base.png' })
    expect(o.mode).toBe('edit')
    expect(o.ref).toBe('base.png')
  })

  it('parses --target-size WxH into a tuple', () => {
    const o = buildImagineOptions('p', { ref: 'b.png', targetSize: '40x60' })
    expect(o.targetSize).toEqual([40, 60])
  })

  it('throws on malformed --size', () => {
    expect(() => buildImagineOptions('p', { size: 'big' })).toThrow(/size/i)
  })

  it('throws when prompt empty', () => {
    expect(() => buildImagineOptions('', {})).toThrow(/prompt/i)
  })

  it('throws when --extra given without --ref', () => {
    expect(() => buildImagineOptions('p', { extra: ['a.png'] })).toThrow(/--extra requires --ref/)
  })

  it('generates a default timestamped out path', () => {
    const o = buildImagineOptions('p', {})
    expect(o.out).toMatch(/^imagine-\d+\.png$/)
  })
})
