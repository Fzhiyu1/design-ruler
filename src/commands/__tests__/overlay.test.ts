import { describe, it, expect } from 'vitest'
import { buildOverlayOptions } from '../overlay.js'

describe('buildOverlayOptions', () => {
  it('parses required options', () => {
    const opts = buildOverlayOptions({
      design: './design.png',
      url: 'http://localhost:3000',
    })
    expect(opts.designImagePath).toContain('design.png')
    expect(opts.targetUrl).toBe('http://localhost:3000')
    expect(opts.port).toBe(9876)
  })

  it('throws if design missing', () => {
    expect(() => buildOverlayOptions({ url: 'http://localhost:3000' } as any)).toThrow()
  })

  it('throws if url missing', () => {
    expect(() => buildOverlayOptions({ design: './x.png' } as any)).toThrow()
  })

  it('accepts custom port', () => {
    const opts = buildOverlayOptions({
      design: './design.png',
      url: 'http://localhost:3000',
      port: '8888',
    })
    expect(opts.port).toBe(8888)
  })

  it('accepts direct offset/scale/opacity params', () => {
    const opts = buildOverlayOptions({
      design: './design.png',
      url: 'http://localhost:3000',
      offsetX: '0',
      offsetY: '10',
      scale: '1.5',
      opacity: '0.8',
    })
    expect(opts.offsetX).toBe(0)
    expect(opts.offsetY).toBe(10)
    expect(opts.scale).toBe(1.5)
    expect(opts.opacity).toBe(0.8)
  })

  it('accepts selector', () => {
    const opts = buildOverlayOptions({
      design: './design.png',
      url: 'http://localhost:3000',
      selector: '.dialog',
    })
    expect(opts.selector).toBe('.dialog')
  })

  it('accepts output path', () => {
    const opts = buildOverlayOptions({
      design: './design.png',
      url: 'http://localhost:3000',
      output: './ghost.png',
    })
    expect(opts.output).toBe('./ghost.png')
  })
})
