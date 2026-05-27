import { writeFile, mkdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { dirname } from 'path'

export const BASE_URL = 'https://ai-gateway.vercel.sh/v1'
export const DEFAULT_GEN_MODEL = 'openai/gpt-image-2'
export const DEFAULT_EDIT_MODEL = 'google/gemini-2.5-flash-image'

export interface GenerateOptions {
  apiKey: string
  prompt: string
  out: string
  quality?: string
  size?: string
  model?: string
}
export interface GenerateResult { out: string; bytes: number; model: string; mode: 'generate' }

function headers(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
}

async function saveB64(b64: string, out: string): Promise<number> {
  await mkdir(dirname(out), { recursive: true })
  const buf = Buffer.from(b64, 'base64')
  await writeFile(out, buf)
  return buf.length
}

export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
  const model = opts.model ?? DEFAULT_GEN_MODEL
  const resp = await fetch(`${BASE_URL}/images/generations`, {
    method: 'POST',
    headers: headers(opts.apiKey),
    body: JSON.stringify({
      model,
      prompt: opts.prompt,
      n: 1,
      quality: opts.quality ?? 'medium',
      size: opts.size ?? 'auto',
      response_format: 'b64_json',
    }),
  })
  if (!resp.ok) {
    throw new Error(`image2 generate failed: ${resp.status} ${await resp.text()}`)
  }
  const data = (await resp.json()) as { data?: Array<{ b64_json?: string }> }
  const b64 = data?.data?.[0]?.b64_json
  if (!b64) throw new Error('image2 generate: no image returned')
  const bytes = await saveB64(b64, opts.out)
  return { out: opts.out, bytes, model, mode: 'generate' }
}

export interface EditOptions {
  apiKey: string
  prompt: string
  ref: string
  out: string
  extra?: string[]
  targetSize?: [number, number]
  model?: string
}
export interface EditResult { out: string; bytes: number; model: string; mode: 'edit' }

async function toDataUrl(path: string): Promise<string> {
  const buf = await readFile(path)
  return `data:image/png;base64,${buf.toString('base64')}`
}

type ContentPart =
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'text'; text: string }

export async function edit(opts: EditOptions): Promise<EditResult> {
  for (const p of [opts.ref, ...(opts.extra ?? [])]) {
    if (!existsSync(p)) throw new Error(`reference image not found: ${p}`)
  }
  const model = opts.model ?? DEFAULT_EDIT_MODEL
  const content: ContentPart[] = [{ type: 'image_url', image_url: { url: await toDataUrl(opts.ref) } }]
  for (const p of opts.extra ?? []) {
    content.push({ type: 'image_url', image_url: { url: await toDataUrl(p) } })
  }
  content.push({ type: 'text', text: opts.prompt })

  const resp = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: headers(opts.apiKey),
    body: JSON.stringify({ model, messages: [{ role: 'user', content }] }),
  })
  if (!resp.ok) {
    throw new Error(`image2 edit failed: ${resp.status} ${await resp.text()}`)
  }
  const data = (await resp.json()) as { choices?: Array<{ message?: { images?: Array<{ image_url: { url: string } }> } }> }
  const images = data?.choices?.[0]?.message?.images ?? []
  if (images.length === 0) throw new Error('image2 edit: no image returned')
  let b64: string = String(images[0].image_url.url).split(',')[1]
  if (!b64) throw new Error('image2 edit: unexpected image_url format (expected data URL)')

  if (opts.targetSize) {
    const sharp = (await import('sharp')).default
    const [tw, th] = opts.targetSize
    const buf = await sharp(Buffer.from(b64, 'base64'))
      .resize(tw, th, { fit: 'contain', background: { r: 0, g: 0, b: 0 } })
      .png()
      .toBuffer()
    b64 = buf.toString('base64')
  }
  const bytes = await saveB64(b64, opts.out)
  return { out: opts.out, bytes, model, mode: 'edit' }
}
