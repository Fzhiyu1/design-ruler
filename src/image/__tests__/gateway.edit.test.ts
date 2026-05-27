import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { edit, BASE_URL, DEFAULT_EDIT_MODEL } from '../gateway.js'

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAQDJ/oXqAAAAAElFTkSuQmCC'

let tmp: string
let ref: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'dr-edit-'))
  ref = join(tmp, 'ref.png')
  writeFileSync(ref, Buffer.from(PNG_B64, 'base64'))
})
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); vi.unstubAllGlobals() })

function okResponse() {
  return new Response(JSON.stringify({
    choices: [{ message: { images: [{ image_url: { url: `data:image/png;base64,${PNG_B64}` } }] } }],
  }), { status: 200 })
}

describe('gateway.edit', () => {
  it('builds content array: ref + extra + text, posts to chat/completions', async () => {
    const extra = join(tmp, 'extra.png')
    writeFileSync(extra, Buffer.from(PNG_B64, 'base64'))
    const fetchMock = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)

    const out = join(tmp, 'o.png')
    const result = await edit({ apiKey: 'k', prompt: 'change color', ref, out, extra: [extra] })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${BASE_URL}/chat/completions`)
    const body = JSON.parse(init.body)
    expect(body.model).toBe(DEFAULT_EDIT_MODEL)
    const content = body.messages[0].content
    expect(content).toHaveLength(3)
    expect(content[0].type).toBe('image_url')
    expect(content[1].type).toBe('image_url')
    expect(content[2]).toEqual({ type: 'text', text: 'change color' })

    expect(result.mode).toBe('edit')
    expect(result.bytes).toBeGreaterThan(0)
  })

  it('throws when ref file missing (pre-flight)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(edit({ apiKey: 'k', prompt: 'p', ref: join(tmp, 'nope.png'), out: join(tmp, 'o.png') }))
      .rejects.toThrow(/not found/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws when images empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { images: [] } }] }), { status: 200 })))
    await expect(edit({ apiKey: 'k', prompt: 'p', ref, out: join(tmp, 'o.png') }))
      .rejects.toThrow(/no image/i)
  })

  it('throws on non-data-URL image_url', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({
        choices: [{ message: { images: [{ image_url: { url: 'https://example.com/x.png' } }] } }],
      }), { status: 200 })))
    await expect(edit({ apiKey: 'k', prompt: 'p', ref, out: join(tmp, 'o.png') }))
      .rejects.toThrow(/unexpected image_url format/i)
  })

  it('applies targetSize via sharp (output is valid PNG of given size)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()))
    const out = join(tmp, 'sized.png')
    await edit({ apiKey: 'k', prompt: 'p', ref, out, targetSize: [40, 60] })
    const sharp = (await import('sharp')).default
    const meta = await sharp(out).metadata()
    expect(meta.width).toBe(40)
    expect(meta.height).toBe(60)
  })
})
