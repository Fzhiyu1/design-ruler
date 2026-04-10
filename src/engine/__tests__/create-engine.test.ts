import { describe, it, expect } from 'vitest'
import { resolveEngineType } from '../create-engine.js'

describe('resolveEngineType', () => {
  it('returns cdp when cdp option is provided', () => {
    expect(resolveEngineType({ cdp: '127.0.0.1:9222' })).toBe('cdp')
  })

  it('returns playwright when no cdp option', () => {
    expect(resolveEngineType({})).toBe('playwright')
  })

  it('returns playwright when cdp is undefined', () => {
    expect(resolveEngineType({ cdp: undefined })).toBe('playwright')
  })
})
