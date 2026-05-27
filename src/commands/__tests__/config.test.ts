import { describe, it, expect } from 'vitest'
import { maskKey, KEY_MAP } from '../config.js'

describe('config command helpers', () => {
  it('maskKey shows first 4 and last 5', () => {
    expect(maskKey('vck_FAKETESTKEYREDACTED00Irv0e')).toBe('vck_…Irv0e')
  })

  it('maskKey collapses very short values', () => {
    expect(maskKey('short')).toBe('…')
  })

  it('maskKey collapses exactly at length 9', () => {
    expect(maskKey('a'.repeat(9))).toBe('…')
  })

  it('maskKey masks at length 10', () => {
    expect(maskKey('abcde12345')).toBe('abcd…12345')
  })

  it('KEY_MAP maps ai-gateway-key to aiGatewayKey', () => {
    expect(KEY_MAP['ai-gateway-key']).toBe('aiGatewayKey')
  })
})
