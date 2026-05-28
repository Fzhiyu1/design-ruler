import { writeFile } from 'fs/promises'
import { resolve } from 'path'

const ICONIFY = 'https://api.iconify.design'
const UA = 'Mozilla/5.0'

/** Iconify search endpoint URL. */
export function buildSearchUrl(query: string, set: string | undefined, limit: number): string {
  const u = new URL(ICONIFY + '/search')
  u.searchParams.set('query', query)
  u.searchParams.set('limit', String(limit))
  if (set) u.searchParams.set('prefix', set)
  return u.toString()
}

/** Iconify single-icon SVG URL. */
export function buildSvgUrl(prefix: string, name: string, size?: number): string {
  const u = new URL(`${ICONIFY}/${prefix}/${name}.svg`)
  if (size) u.searchParams.set('height', String(size))
  return u.toString()
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`Iconify request failed (${res.status}): ${url}`)
  return res.json()
}

export interface IconOptions { set?: string; size?: number; limit?: number }

/** Search Iconify, return ["prefix:name", ...]. */
export async function searchIcons(query: string, opts: IconOptions): Promise<string[]> {
  const data = await getJson(buildSearchUrl(query, opts.set, opts.limit ?? 20))
  return Array.isArray(data.icons) ? data.icons : []
}

/** Search then fetch the best-match SVG. */
export async function fetchIconSvg(query: string, opts: IconOptions): Promise<{ name: string; svg: string }> {
  const icons = await searchIcons(query, opts)
  if (icons.length === 0) {
    throw new Error(`No icon found for "${query}"${opts.set ? ` in set "${opts.set}"` : ''}. Try --search, a different query, or another --set.`)
  }
  const full = icons[0]
  const colonIdx = full.indexOf(':')
  if (colonIdx < 1) throw new Error(`Iconify returned a malformed icon id (expected "prefix:name"): ${JSON.stringify(full)}`)
  const prefix = full.slice(0, colonIdx)
  const name = full.slice(colonIdx + 1)
  const res = await fetch(buildSvgUrl(prefix, name, opts.size), { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`Iconify svg fetch failed (${res.status}): ${full}`)
  return { name: full, svg: await res.text() }
}

/** CLI handler. */
export async function icon(query: string, opts: Record<string, any>): Promise<void> {
  const set: string | undefined = opts.set
  const limit = opts.limit != null ? Number(opts.limit) : 20
  if (!Number.isInteger(limit) || limit < 1) throw new Error(`--limit must be a positive integer, got: ${JSON.stringify(opts.limit)}`)
  if (opts.search) {
    const icons = await searchIcons(query, { set, limit })
    console.log(JSON.stringify({ query, icons }))
    return
  }
  let size: number | undefined
  if (opts.size != null) {
    size = Number(opts.size)
    if (!Number.isInteger(size) || size < 1) throw new Error(`--size must be a positive integer, got: ${JSON.stringify(opts.size)}`)
  }
  const { name, svg } = await fetchIconSvg(query, { set, size, limit })
  if (opts.out) {
    const outPath = resolve(opts.out)
    await writeFile(outPath, svg)
    console.log(JSON.stringify({ query, name, out: outPath, bytes: Buffer.byteLength(svg) }))
  } else {
    process.stdout.write(svg)
  }
}
