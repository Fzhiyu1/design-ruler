import type { RuntimeEngine } from './types.js'

export interface EngineOptions {
  cdp?: string // host:port
  url: string
  viewport?: { width: number; height: number }
  headless?: boolean
}

export function resolveEngineType(options: { cdp?: string }): 'cdp' | 'playwright' {
  return options.cdp ? 'cdp' : 'playwright'
}

export async function createEngine(options: EngineOptions): Promise<RuntimeEngine> {
  const type = resolveEngineType(options)

  if (type === 'cdp') {
    const { CdpEngine } = await import('./cdp/cdp-engine.js')
    const [host, portStr] = options.cdp!.split(':')
    const port = parseInt(portStr, 10)
    return CdpEngine.create(host, port, options.url)
  }

  const { PlaywrightEngine } = await import('./playwright/playwright-engine.js')
  return PlaywrightEngine.create(options.url, {
    headless: options.headless ?? true,
    viewport: options.viewport,
  })
}
