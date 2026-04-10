import { describe, it, expect } from 'vitest'
import { buildClip } from '../cdp-engine.js'
import { RELEVANT_PROPS } from '../../constants.js'

describe('buildClip', () => {
  it('builds clip from box model with padding', () => {
    const model = {
      content: { quad: [10, 10, 100, 10, 100, 50, 10, 50] },
      border: { quad: [8, 8, 102, 8, 102, 52, 8, 52] },
    }
    const viewport = { width: 1920, height: 1080 }
    const clip = buildClip(model, viewport, 4)

    expect(clip.x).toBe(4)   // 8 - 4
    expect(clip.y).toBe(4)   // 8 - 4
    expect(clip.width).toBe(102)  // min(1920, 102+4) - 4 = 102
    expect(clip.height).toBe(52)  // min(1080, 52+4) - 4 = 52
  })

  it('clamps clip to viewport bounds', () => {
    const model = {
      content: { quad: [0, 0, 100, 0, 100, 50, 0, 50] },
      border: { quad: [0, 0, 100, 0, 100, 50, 0, 50] },
    }
    const viewport = { width: 80, height: 40 }
    const clip = buildClip(model, viewport, 10)

    expect(clip.x).toBe(0)
    expect(clip.y).toBe(0)
    expect(clip.width).toBeLessThanOrEqual(80)
    expect(clip.height).toBeLessThanOrEqual(40)
  })

  it('handles element at viewport edge correctly', () => {
    const model = {
      content: { quad: [0, 0, 50, 0, 50, 30, 0, 30] },
      border: { quad: [0, 0, 50, 0, 50, 30, 0, 30] },
    }
    const viewport = { width: 100, height: 100 }
    const clip = buildClip(model, viewport, 5)

    // x clamped to 0, width = min(100, 50+5) - 0 = 55
    expect(clip.x).toBe(0)
    expect(clip.width).toBe(55)
    expect(clip.y).toBe(0)
    expect(clip.height).toBe(35)
  })
})

describe('RELEVANT_PROPS', () => {
  it('contains essential CSS properties', () => {
    expect(RELEVANT_PROPS).toContain('width')
    expect(RELEVANT_PROPS).toContain('border-radius')
    expect(RELEVANT_PROPS).toContain('gap')
    expect(RELEVANT_PROPS).toContain('font-size')
    expect(RELEVANT_PROPS).toContain('background-color')
  })

  it('has no duplicates', () => {
    const unique = new Set(RELEVANT_PROPS)
    expect(unique.size).toBe(RELEVANT_PROPS.length)
  })
})
