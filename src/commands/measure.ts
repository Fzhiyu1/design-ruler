import type { MeasureResult, ChildElement } from '../engine/types.js'
import { createEngine } from '../engine/create-engine.js'

export interface MeasureCommandOptions {
  url: string
  selector: string
  depth: number
  cdp?: string
  format?: 'json' | 'table'
}

export function buildMeasureOptions(raw: Record<string, any>): MeasureCommandOptions {
  if (!raw.url) throw new Error('--url is required')
  if (!raw.selector) throw new Error('--selector is required')
  return {
    url: raw.url,
    selector: raw.selector,
    depth: raw.depth != null ? parseInt(raw.depth, 10) : 1,
    cdp: raw.cdp,
    format: raw.format ?? 'json',
  }
}

export function formatMeasureResult(result: MeasureResult, format: 'json' | 'table'): string {
  if (format === 'table') {
    const lines: string[] = []
    lines.push(`Selector: ${result.selector}`)
    lines.push(`BBox: x=${result.bbox.x} y=${result.bbox.y} w=${result.bbox.width} h=${result.bbox.height}`)
    lines.push('')
    lines.push('Property'.padEnd(30) + 'Value')
    lines.push('-'.repeat(60))
    for (const [key, val] of Object.entries(result.computedStyle)) {
      lines.push(key.padEnd(30) + val)
    }
    if (result.children?.length) {
      lines.push('')
      lines.push(`Children (${result.children.length}):`)
      function printChildren(children: ChildElement[], indent: number) {
        for (const c of children) {
          const pad = ' '.repeat(indent)
          lines.push(`${pad}<${c.tag}> .${c.className} [${c.bbox.width}x${c.bbox.height}] ${c.text ?? ''}`)
          if (c.children?.length) {
            printChildren(c.children, indent + 2)
          }
        }
      }
      printChildren(result.children, 2)
    }
    return lines.join('\n')
  }
  return JSON.stringify(result, null, 2)
}

export async function measure(raw: Record<string, any>): Promise<void> {
  const opts = buildMeasureOptions(raw)
  const engine = await createEngine({ url: opts.url, cdp: opts.cdp })
  try {
    const result = await engine.measure(opts.selector, opts.depth)
    console.log(formatMeasureResult(result, opts.format ?? 'json'))
  } finally {
    await engine.close()
  }
}
