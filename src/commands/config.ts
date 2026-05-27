import { readConfig, writeConfig, getConfigPath } from '../config/store.js'

export const KEY_MAP: Readonly<Record<string, string>> = { 'ai-gateway-key': 'aiGatewayKey' } as const

export function maskKey(value: string): string {
  if (value.length <= 9) return '…'
  return `${value.slice(0, 4)}…${value.slice(-5)}`
}

function fieldFor(key: string): string {
  const field = KEY_MAP[key]
  if (!field) throw new Error(`unknown config key: ${key}. Supported: ${Object.keys(KEY_MAP).join(', ')}`)
  return field
}

export function configSet(key: string, value: string): void {
  const field = fieldFor(key)
  const cfg = readConfig()
  cfg[field] = value
  writeConfig(cfg)
  console.log(JSON.stringify({ set: key, masked: maskKey(value), path: getConfigPath() }))
}

export function configGet(key: string): void {
  const field = fieldFor(key)
  const value = readConfig()[field]
  console.log(JSON.stringify({ [key]: value ? maskKey(value) : null }))
}

export function configPath(): void {
  console.log(JSON.stringify({ path: getConfigPath() }))
}
