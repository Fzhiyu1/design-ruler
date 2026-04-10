import { describe, it, expect } from 'vitest'
import { resolveSelector } from '../selector.js'

describe('resolveSelector', () => {
  it('passes through normal selectors', () => {
    expect(resolveSelector('.dialog')).toBe('.dialog')
    expect(resolveSelector('#app')).toBe('#app')
    expect(resolveSelector('[data-id="x"]')).toBe('[data-id="x"]')
  })

  it('converts ~ prefix to class contains', () => {
    expect(resolveSelector('~global-header')).toBe('[class*="global-header"]')
    expect(resolveSelector('~card')).toBe('[class*="card"]')
  })

  it('trims whitespace after ~', () => {
    expect(resolveSelector('~ header')).toBe('[class*="header"]')
  })
})
