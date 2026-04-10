import { describe, it, expect } from 'vitest'
import { buildMeasureOptions, formatMeasureResult } from '../measure.js'

describe('buildMeasureOptions', () => {
  it('parses required options', () => {
    const opts = buildMeasureOptions({
      url: 'http://localhost:3000',
      selector: '.dialog',
    })
    expect(opts.url).toBe('http://localhost:3000')
    expect(opts.selector).toBe('.dialog')
    expect(opts.depth).toBe(1) // default
  })

  it('throws if selector missing', () => {
    expect(() => buildMeasureOptions({ url: 'http://localhost:3000' } as any)).toThrow()
  })

  it('throws if url missing', () => {
    expect(() => buildMeasureOptions({ selector: '.x' } as any)).toThrow()
  })

  it('accepts optional depth', () => {
    const opts = buildMeasureOptions({
      url: 'http://localhost:3000',
      selector: '.dialog',
      depth: '3',
    })
    expect(opts.depth).toBe(3)
  })
})

describe('formatMeasureResult', () => {
  const mockResult = {
    selector: '.box',
    bbox: { x: 10, y: 20, width: 200, height: 100 },
    computedStyle: { width: '200px', height: '100px', 'border-radius': '8px' },
    children: [
      { tag: 'span', className: 'label', bbox: { x: 0, y: 0, width: 50, height: 20 }, text: 'hi' },
    ],
  }

  it('formats as JSON by default', () => {
    const output = formatMeasureResult(mockResult, 'json')
    const parsed = JSON.parse(output)
    expect(parsed.selector).toBe('.box')
    expect(parsed.bbox.width).toBe(200)
  })

  it('formats as table', () => {
    const output = formatMeasureResult(mockResult, 'table')
    expect(output).toContain('width')
    expect(output).toContain('200px')
  })
})
