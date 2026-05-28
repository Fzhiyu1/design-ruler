import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildSearchUrl, buildSvgUrl, searchIcons, fetchIconSvg, icon } from '../icon.js'

describe('buildSearchUrl', () => {
  it('builds an Iconify search URL with query and limit', () => {
    expect(buildSearchUrl('search', undefined, 20)).toBe('https://api.iconify.design/search?query=search&limit=20')
  })
  it('adds prefix when a set is given', () => {
    expect(buildSearchUrl('heart', 'lucide', 5)).toBe('https://api.iconify.design/search?query=heart&limit=5&prefix=lucide')
  })
})

describe('buildSvgUrl', () => {
  it('builds an svg URL', () => {
    expect(buildSvgUrl('lucide', 'search')).toBe('https://api.iconify.design/lucide/search.svg')
  })
  it('adds height when a size is given', () => {
    expect(buildSvgUrl('lucide', 'search', 48)).toBe('https://api.iconify.design/lucide/search.svg?height=48')
  })
})

function mockFetch(handler: (url: string, init?: any) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(handler as any))
}

describe('searchIcons', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns icon names and sends a User-Agent header', async () => {
    let sentInit: any
    mockFetch(async (_url, init) => { sentInit = init; return new Response(JSON.stringify({ icons: ['lucide:search', 'mdi:magnify'] }), { status: 200 }) })
    const names = await searchIcons('search', {})
    expect(names).toEqual(['lucide:search', 'mdi:magnify'])
    expect(sentInit.headers['User-Agent']).toBeTruthy()
  })

  it('throws on a non-ok response', async () => {
    mockFetch(async () => new Response('', { status: 403 }))
    await expect(searchIcons('x', {})).rejects.toThrow(/403/)
  })
})

describe('fetchIconSvg', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('searches then fetches the first match svg', async () => {
    mockFetch(async (url) => url.includes('/search?')
      ? new Response(JSON.stringify({ icons: ['lucide:search'] }), { status: 200 })
      : new Response('<svg>x</svg>', { status: 200 }))
    const r = await fetchIconSvg('search', {})
    expect(r.name).toBe('lucide:search')
    expect(r.svg).toContain('<svg')
  })

  it('throws a helpful error when nothing matches', async () => {
    mockFetch(async () => new Response(JSON.stringify({ icons: [] }), { status: 200 }))
    await expect(fetchIconSvg('zzzz', {})).rejects.toThrow(/No icon found/)
  })

  it('throws when the svg fetch fails', async () => {
    mockFetch(async (url) => url.includes('/search?')
      ? new Response(JSON.stringify({ icons: ['lucide:search'] }), { status: 200 })
      : new Response('', { status: 500 }))
    await expect(fetchIconSvg('search', {})).rejects.toThrow(/svg fetch failed/)
  })

  it('throws on a malformed icon id (no colon)', async () => {
    mockFetch(async () => new Response(JSON.stringify({ icons: ['nocolon'] }), { status: 200 }))
    await expect(fetchIconSvg('x', {})).rejects.toThrow(/malformed/)
  })
})

describe('icon handler', () => {
  let tmp: string
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'dr-icon-')) })
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); vi.unstubAllGlobals() })

  it('--search prints candidate JSON without fetching svg', async () => {
    mockFetch(async () => new Response(JSON.stringify({ icons: ['lucide:search'] }), { status: 200 }))
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await icon('search', { search: true })
    const out = JSON.parse(spy.mock.calls[0][0] as string)
    spy.mockRestore()
    expect(out).toEqual({ query: 'search', icons: ['lucide:search'] })
    expect((globalThis.fetch as any).mock.calls).toHaveLength(1)
  })

  it('writes svg to --out', async () => {
    mockFetch(async (url) => url.includes('/search?')
      ? new Response(JSON.stringify({ icons: ['lucide:search'] }), { status: 200 })
      : new Response('<svg>x</svg>', { status: 200 }))
    const out = join(tmp, 'search.svg')
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await icon('search', { out })
    spy.mockRestore()
    expect(readFileSync(out, 'utf-8')).toContain('<svg')
  })

  it('writes svg to stdout when no --out', async () => {
    mockFetch(async (url) => url.includes('/search?')
      ? new Response(JSON.stringify({ icons: ['lucide:search'] }), { status: 200 })
      : new Response('<svg>y</svg>', { status: 200 }))
    const chunks: string[] = []
    const orig = process.stdout.write.bind(process.stdout)
    ;(process.stdout as any).write = (c: any) => { chunks.push(String(c)); return true }
    await icon('heart', {})
    ;(process.stdout as any).write = orig
    expect(chunks.join('')).toContain('<svg')
  })
})
