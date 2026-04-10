import { writeFile, mkdir } from 'fs/promises'
import { dirname } from 'path'
import { createEngine } from '../engine/create-engine.js'

export interface ScreenshotCommandOptions {
  url: string
  selector?: string
  output: string
  fullPage?: boolean
  cdp?: string
}

export function buildScreenshotOptions(raw: Record<string, any>): ScreenshotCommandOptions {
  if (!raw.url) throw new Error('--url is required')
  return {
    url: raw.url,
    selector: raw.selector,
    output: raw.output ?? `screenshot-${Date.now()}.png`,
    fullPage: raw.fullPage ?? false,
    cdp: raw.cdp,
  }
}

export async function screenshot(raw: Record<string, any>): Promise<void> {
  const opts = buildScreenshotOptions(raw)
  const engine = await createEngine({ url: opts.url, cdp: opts.cdp })
  try {
    const buf = await engine.screenshot({
      selector: opts.selector,
      fullPage: opts.fullPage,
    })
    await mkdir(dirname(opts.output), { recursive: true }).catch(() => {})
    await writeFile(opts.output, buf)
    console.log(JSON.stringify({ output: opts.output, bytes: buf.length }))
  } finally {
    await engine.close()
  }
}
