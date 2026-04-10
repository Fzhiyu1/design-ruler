import { describe, it, expect } from 'vitest'
import type { MeasureResult, RuntimeEngine, OverlayParams } from '../types.js'

describe('types', () => {
  it('MeasureResult has required fields', () => {
    const result: MeasureResult = {
      selector: '.test',
      bbox: { x: 0, y: 0, width: 100, height: 50 },
      computedStyle: { width: '100px' },
    }
    expect(result.selector).toBe('.test')
    expect(result.bbox.width).toBe(100)
    expect(result.computedStyle.width).toBe('100px')
  })

  it('MeasureResult supports optional children', () => {
    const result: MeasureResult = {
      selector: '.parent',
      bbox: { x: 0, y: 0, width: 200, height: 100 },
      computedStyle: {},
      children: [
        {
          tag: 'div',
          className: 'child',
          bbox: { x: 10, y: 10, width: 80, height: 40 },
          text: 'hello',
        },
      ],
    }
    expect(result.children).toHaveLength(1)
    expect(result.children![0].tag).toBe('div')
  })

  it('OverlayParams has required fields', () => {
    const params: OverlayParams = {
      designImagePath: './design.png',
      targetUrl: 'http://localhost:3000',
      offsetX: 0,
      offsetY: 0,
      scale: 1.0,
      opacity: 0.5,
    }
    expect(params.scale).toBe(1.0)
  })
})
