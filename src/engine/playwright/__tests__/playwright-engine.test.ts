import { describe, it, expect } from 'vitest'
import { PlaywrightEngine } from '../playwright-engine.js'

describe('PlaywrightEngine', () => {
  it('exports create factory', () => {
    expect(PlaywrightEngine.create).toBeTypeOf('function')
  })

  it('create accepts url and options', () => {
    const createFn = PlaywrightEngine.create
    expect(createFn.length).toBeGreaterThanOrEqual(1)
  })
})
