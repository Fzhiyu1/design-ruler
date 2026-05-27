import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getConfigPath, readConfig, writeConfig, resolveKey } from '../store.js'

let tmp: string
const origXdg = process.env.XDG_CONFIG_HOME
const origKey = process.env.AI_GATEWAY_API_KEY

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'dr-cfg-'))
  process.env.XDG_CONFIG_HOME = tmp
  delete process.env.AI_GATEWAY_API_KEY
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
  if (origXdg === undefined) delete process.env.XDG_CONFIG_HOME
  else process.env.XDG_CONFIG_HOME = origXdg
  if (origKey === undefined) delete process.env.AI_GATEWAY_API_KEY
  else process.env.AI_GATEWAY_API_KEY = origKey
})

describe('config store', () => {
  it('getConfigPath honors XDG_CONFIG_HOME', () => {
    expect(getConfigPath()).toBe(join(tmp, 'design-ruler', 'config.json'))
  })

  it('readConfig returns {} when file missing', () => {
    expect(readConfig()).toEqual({})
  })

  it('writeConfig then readConfig round-trips', () => {
    writeConfig({ aiGatewayKey: 'vck_abc' })
    expect(readConfig()).toEqual({ aiGatewayKey: 'vck_abc' })
  })

  it('writeConfig sets file mode 0600', () => {
    writeConfig({ aiGatewayKey: 'vck_abc' })
    const mode = statSync(getConfigPath()).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('resolveKey priority: flag > env > file', () => {
    writeConfig({ aiGatewayKey: 'from_file' })
    expect(resolveKey()).toBe('from_file')
    process.env.AI_GATEWAY_API_KEY = 'from_env'
    expect(resolveKey()).toBe('from_env')
    expect(resolveKey('from_flag')).toBe('from_flag')
  })

  it('resolveKey returns undefined when nothing set', () => {
    expect(resolveKey()).toBeUndefined()
  })

  it('resolveKey treats empty string flag as present (no fallback)', () => {
    writeConfig({ aiGatewayKey: 'from_file' })
    process.env.AI_GATEWAY_API_KEY = 'from_env'
    expect(resolveKey('')).toBe('')
  })

  it('readConfig returns {} when file contains a non-object (array)', () => {
    mkdirSync(join(tmp, 'design-ruler'), { recursive: true })
    writeFileSync(getConfigPath(), '[1,2,3]')
    expect(readConfig()).toEqual({})
  })
})
