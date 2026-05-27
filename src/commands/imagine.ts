import { resolveKey } from '../config/store.js'
import { generate, edit } from '../image/gateway.js'

export interface ImagineOptions {
  prompt: string
  out: string
  quality: string
  size?: string
  model?: string
  ref?: string
  extra?: string[]
  targetSize?: [number, number]
  key?: string
  mode: 'generate' | 'edit'
}

function parseSize(s?: string): [number, number] | undefined {
  if (!s) return undefined
  const m = /^(\d+)x(\d+)$/.exec(s)
  if (!m) throw new Error(`invalid size: ${s} (expected WxH, e.g. 1024x1536)`)
  return [parseInt(m[1], 10), parseInt(m[2], 10)]
}

export function buildImagineOptions(prompt: string, raw: Record<string, any>): ImagineOptions {
  if (!prompt) throw new Error('prompt is required')
  if (raw.extra && !raw.ref) {
    throw new Error('--extra requires --ref (edit mode only)')
  }
  parseSize(raw.size) // 校验 --size 格式（generate 用，透传字符串）
  return {
    prompt,
    out: raw.out ?? `imagine-${Date.now()}.png`,
    quality: raw.quality ?? 'medium',
    size: raw.size,
    model: raw.model,
    ref: raw.ref,
    extra: raw.extra,
    targetSize: parseSize(raw.targetSize),
    key: raw.key,
    mode: raw.ref ? 'edit' : 'generate',
  }
}

export async function imagine(prompt: string, raw: Record<string, any>): Promise<void> {
  const opts = buildImagineOptions(prompt, raw)
  const apiKey = resolveKey(opts.key || undefined)
  if (!apiKey) {
    throw new Error('No API key. Run: design-ruler config set ai-gateway-key <vck_...> (or set AI_GATEWAY_API_KEY)')
  }
  const result = opts.mode === 'edit'
    ? await edit({ apiKey, prompt: opts.prompt, ref: opts.ref!, out: opts.out, extra: opts.extra, targetSize: opts.targetSize, model: opts.model })
    : await generate({ apiKey, prompt: opts.prompt, out: opts.out, quality: opts.quality, size: opts.size, model: opts.model })
  console.log(JSON.stringify(result))
}
