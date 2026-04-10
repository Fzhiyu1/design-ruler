import { describe, it, expect } from 'vitest'
import { buildMeasureOptions, formatMeasureResult, pickFields } from '../measure.js'

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

  it('accepts pick option', () => {
    const opts = buildMeasureOptions({
      url: 'http://localhost:3000',
      selector: '.dialog',
      pick: 'bbox',
    })
    expect(opts.pick).toBe('bbox')
  })

  it('resolves ~ selector to fuzzy match', () => {
    const opts = buildMeasureOptions({
      url: 'http://localhost:3000',
      selector: '~header',
    })
    expect(opts.selector).toBe('[class*="header"]')
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

describe('pickFields', () => {
  const mockResult = {
    selector: '.box',
    bbox: { x: 10, y: 20, width: 200, height: 100 },
    computedStyle: { padding: '24px', 'border-radius': '12px', gap: '16px' },
    children: [
      { tag: 'span', className: 'label', bbox: { x: 0, y: 0, width: 50, height: 20 }, text: 'hi' },
    ],
  }

  it('picks bbox', () => {
    const output = JSON.parse(pickFields(mockResult, 'bbox'))
    expect(output.width).toBe(200)
    expect(output.x).toBe(10)
  })

  it('picks children', () => {
    const output = JSON.parse(pickFields(mockResult, 'children'))
    expect(output).toHaveLength(1)
    expect(output[0].tag).toBe('span')
  })

  it('picks specific CSS properties', () => {
    const output = JSON.parse(pickFields(mockResult, 'padding,border-radius,gap'))
    expect(output.padding).toBe('24px')
    expect(output['border-radius']).toBe('12px')
    expect(output.gap).toBe('16px')
  })

  it('ignores non-existent CSS properties', () => {
    const output = JSON.parse(pickFields(mockResult, 'padding,nonexistent'))
    expect(output.padding).toBe('24px')
    expect(output.nonexistent).toBeUndefined()
  })

  it('returns empty children array when no children', () => {
    const noChildren = { ...mockResult, children: undefined }
    const output = JSON.parse(pickFields(noChildren, 'children'))
    expect(output).toEqual([])
  })
})
