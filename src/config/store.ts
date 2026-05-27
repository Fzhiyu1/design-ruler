import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export function getConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME
  return xdg ? join(xdg, 'design-ruler') : join(homedir(), '.config', 'design-ruler')
}

export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json')
}

export function readConfig(): Record<string, string> {
  const p = getConfigPath()
  if (!existsSync(p)) return {}
  try {
    const parsed: unknown = JSON.parse(readFileSync(p, 'utf-8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return parsed as Record<string, string>
  } catch {
    return {}
  }
}

export function writeConfig(config: Record<string, string>): void {
  mkdirSync(getConfigDir(), { recursive: true })
  const p = getConfigPath()
  writeFileSync(p, JSON.stringify(config, null, 2), { mode: 0o600 })
  chmodSync(p, 0o600)
}

export function resolveKey(flagKey?: string): string | undefined {
  if (flagKey !== undefined) return flagKey
  const env = process.env.AI_GATEWAY_API_KEY
  if (env) return env
  return readConfig().aiGatewayKey
}
