import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { generate, BASE_URL, DEFAULT_GEN_MODEL } from '../gateway.js'

// 1x1 透明 PNG 的 base64
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAQDJ/oXqAAAAAElFTkSuQmCC'

let tmp: string
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'dr-gen-')) })
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); vi.unstubAllGlobals() })

describe('gateway.generate', () => {
  it('posts correct request and writes the decoded PNG', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const out = join(tmp, 'a.png')
    const result = await generate({ apiKey: 'vck_x', prompt: 'hello', out })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${BASE_URL}/images/generations`)
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer vck_x')
    const body = JSON.parse(init.body)
    expect(body.model).toBe(DEFAULT_GEN_MODEL)
    expect(body.prompt).toBe('hello')
    expect(body.response_format).toBe('b64_json')
    expect(body.quality).toBe('medium')
    expect(body.n).toBe(1)

    expect(result.mode).toBe('generate')
    expect(result.bytes).toBeGreaterThan(0)
    expect(readFileSync(out).length).toBe(result.bytes)
  })

  it('passes through quality/size/model overrides', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await generate({ apiKey: 'k', prompt: 'p', out: join(tmp, 'b.png'), quality: 'high', size: '1024x1536', model: 'openai/foo' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.quality).toBe('high')
    expect(body.size).toBe('1024x1536')
    expect(body.model).toBe('openai/foo')
  })

  it('throws on non-2xx with status and body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })))
    await expect(generate({ apiKey: 'k', prompt: 'p', out: join(tmp, 'c.png') }))
      .rejects.toThrow(/401/)
  })

  it('throws when no image returned', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })))
    await expect(generate({ apiKey: 'k', prompt: 'p', out: join(tmp, 'd.png') }))
      .rejects.toThrow(/no image/i)
  })
})
