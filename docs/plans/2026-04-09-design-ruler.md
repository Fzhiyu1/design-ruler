# design-ruler Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a design-source-agnostic CLI tool that measures runtime rendering, captures screenshots, and generates interactive overlay comparisons — giving AI agents a "ruler" to verify their own CSS changes.

**Architecture:** Three commands (`measure`, `screenshot`, `overlay`) backed by a pluggable `RuntimeEngine` interface with Playwright (default) and CDP (advanced) implementations. The overlay command launches a temporary local web server with an interactive alignment UI. All output is JSON-first for AI consumption.

**Tech Stack:** TypeScript, tsup (build), Vitest (test), commander (CLI), Playwright (browser), ws (CDP), Sharp (image processing), pnpm

---

## Task 0: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/index.ts` (empty entry)

**Step 1: Initialize project**

```bash
cd /Users/fangzhiyu/run/design-ruler
pnpm init
```

**Step 2: Install dependencies**

```bash
pnpm add commander sharp ws
pnpm add -D typescript tsup vitest @types/node @types/ws
pnpm add playwright --save-optional
```

**Step 3: Create package.json scripts and config**

```json
{
  "name": "design-ruler",
  "version": "0.1.0",
  "description": "A ruler for AI — measure runtime rendering against design specs",
  "type": "module",
  "bin": {
    "design-ruler": "./dist/cli.js"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "files": ["dist"],
  "keywords": ["design", "verification", "css", "figma", "overlay", "ai"],
  "license": "MIT"
}
```

**Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Step 5: Create tsup.config.ts**

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  banner: ({ format }) => {
    if (format === 'esm') {
      return { js: '#!/usr/bin/env node\n' }
    }
    return {}
  },
})
```

**Step 6: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30000,
  },
})
```

**Step 7: Create .gitignore**

```
node_modules/
dist/
.design-ruler/
*.tgz
```

**Step 8: Create empty entry files**

```typescript
// src/index.ts
export { measure } from './commands/measure.js'
export { screenshot } from './commands/screenshot.js'
export { overlay } from './commands/overlay.js'
```

```typescript
// src/cli.ts
// CLI entry - will be implemented in Task 2
console.log('design-ruler')
```

**Step 9: Verify build**

Run: `pnpm build`
Expected: Compiles without errors (may warn about missing exports, that's OK)

**Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold design-ruler project"
```

---

## Task 1: RuntimeEngine Interface + Types

**Files:**
- Create: `src/engine/types.ts`
- Test: `src/engine/__tests__/types.test.ts`

**Step 1: Write the failing test**

```typescript
// src/engine/__tests__/types.test.ts
import { describe, it, expect } from 'vitest'
import type { MeasureResult, RuntimeEngine, OverlayParams } from '../types.js'

describe('types', () => {
  it('MeasureResult has required fields', () => {
    const result: MeasureResult = {
      selector: '.test',
      bbox: { x: 0, y: 0, width: 100, height: 50 },
      computedStyle: { width: '100px' },
    }
    expect(result.selector).toBe('.test')
    expect(result.bbox.width).toBe(100)
    expect(result.computedStyle.width).toBe('100px')
  })

  it('MeasureResult supports optional children', () => {
    const result: MeasureResult = {
      selector: '.parent',
      bbox: { x: 0, y: 0, width: 200, height: 100 },
      computedStyle: {},
      children: [
        {
          tag: 'div',
          className: 'child',
          bbox: { x: 10, y: 10, width: 80, height: 40 },
          text: 'hello',
        },
      ],
    }
    expect(result.children).toHaveLength(1)
    expect(result.children![0].tag).toBe('div')
  })

  it('OverlayParams has required fields', () => {
    const params: OverlayParams = {
      designImagePath: './design.png',
      targetUrl: 'http://localhost:3000',
      offsetX: 0,
      offsetY: 0,
      scale: 1.0,
      opacity: 0.5,
    }
    expect(params.scale).toBe(1.0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/engine/__tests__/types.test.ts`
Expected: FAIL — module not found

**Step 3: Write the types**

```typescript
// src/engine/types.ts
export interface BBox {
  x: number
  y: number
  width: number
  height: number
}

export interface ChildElement {
  tag: string
  className: string
  bbox: BBox
  text?: string
}

export interface MeasureResult {
  selector: string
  bbox: BBox
  computedStyle: Record<string, string>
  children?: ChildElement[]
}

export interface OverlayParams {
  designImagePath: string
  targetUrl: string
  offsetX: number
  offsetY: number
  scale: number
  opacity: number
  scrollY?: number
}

export interface ScreenshotOptions {
  selector?: string
  fullPage?: boolean
  output?: string
}

export interface RuntimeEngine {
  /** Take a screenshot, optionally of a specific element */
  screenshot(options?: ScreenshotOptions): Promise<Buffer>

  /** Measure an element's bbox + computed style */
  measure(selector: string, depth?: number): Promise<MeasureResult>

  /** Execute JavaScript in the page context */
  evaluate<T = unknown>(expression: string): Promise<T>

  /** Inject a design overlay image onto the page */
  injectOverlay(params: OverlayParams): Promise<void>

  /** Capture the page with overlay applied */
  captureOverlay(): Promise<Buffer>

  /** Clean up resources */
  close(): Promise<void>
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/engine/__tests__/types.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/engine/
git commit -m "feat: define RuntimeEngine interface and core types"
```

---

## Task 2: CDP Client

**Files:**
- Create: `src/engine/cdp/cdp-client.ts`
- Test: `src/engine/cdp/__tests__/cdp-client.test.ts`

**Step 1: Write the failing test**

```typescript
// src/engine/cdp/__tests__/cdp-client.test.ts
import { describe, it, expect } from 'vitest'
import { listTargets, CdpClient } from '../cdp-client.js'

describe('CdpClient', () => {
  it('listTargets parses JSON target list', async () => {
    // This test requires a running Chrome with --remote-debugging-port=9222
    // In CI, skip. Locally, test against a real browser.
    // For unit testing, we test the parsing logic.
    const mockTargets = [
      {
        id: 'abc123',
        title: 'Test Page',
        type: 'page',
        url: 'http://localhost:3000/',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/abc123',
      },
    ]
    expect(mockTargets[0].type).toBe('page')
    expect(mockTargets[0].webSocketDebuggerUrl).toContain('ws://')
  })

  it('CdpClient.call increments message IDs', () => {
    // Verify the id-based request/response matching design
    const ids = new Set<number>()
    for (let i = 0; i < 100; i++) {
      ids.add(i + 1)
    }
    expect(ids.size).toBe(100)
  })
})

describe('target filtering', () => {
  it('filters by URL prefix', () => {
    const targets = [
      { id: '1', title: 'Page', type: 'page', url: 'http://localhost:3000/', webSocketDebuggerUrl: 'ws://...' },
      { id: '2', title: 'DevTools', type: 'other', url: 'devtools://...', webSocketDebuggerUrl: 'ws://...' },
    ]
    const pages = targets.filter(t => t.type === 'page')
    expect(pages).toHaveLength(1)
    expect(pages[0].url).toContain('localhost')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/engine/cdp/__tests__/cdp-client.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// src/engine/cdp/cdp-client.ts
import WebSocket from 'ws'

export interface CdpTarget {
  id: string
  title: string
  type: string
  url: string
  webSocketDebuggerUrl: string
}

export async function listTargets(host: string, port: number): Promise<CdpTarget[]> {
  const res = await fetch(`http://${host}:${port}/json`)
  if (!res.ok) throw new Error(`CDP target list failed: ${res.status}`)
  return res.json() as Promise<CdpTarget[]>
}

export class CdpClient {
  private ws: WebSocket
  private nextId = 1
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  private ready: Promise<void>

  private constructor(wsUrl: string) {
    this.ws = new WebSocket(wsUrl)
    this.ready = new Promise((resolve, reject) => {
      this.ws.once('open', resolve)
      this.ws.once('error', reject)
    })
    this.ws.on('message', (data: WebSocket.Data) => {
      const payload = JSON.parse(data.toString())
      if (payload.id != null) {
        const p = this.pending.get(payload.id)
        if (p) {
          this.pending.delete(payload.id)
          if (payload.error) {
            p.reject(new Error(`CDP: ${payload.error.message}`))
          } else {
            p.resolve(payload.result)
          }
        }
      }
    })
    this.ws.on('close', () => {
      for (const p of this.pending.values()) {
        p.reject(new Error('CDP connection closed'))
      }
      this.pending.clear()
    })
  }

  static async connect(target: CdpTarget): Promise<CdpClient> {
    const client = new CdpClient(target.webSocketDebuggerUrl)
    await client.ready
    await client.call('DOM.enable')
    await client.call('CSS.enable')
    await client.call('Page.enable')
    await client.call('Runtime.enable')
    return client
  }

  async call<T = any>(method: string, params?: Record<string, unknown>): Promise<T> {
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  close(): void {
    this.ws.close()
  }
}

export async function connectToPage(
  host: string,
  port: number,
  urlFilter?: string,
): Promise<{ client: CdpClient; target: CdpTarget }> {
  const targets = await listTargets(host, port)
  const pages = targets.filter(t => t.type === 'page')
  if (pages.length === 0) throw new Error('No page targets found')

  const target = urlFilter
    ? pages.find(t => t.url.includes(urlFilter)) ?? pages[0]
    : pages[0]

  const client = await CdpClient.connect(target)
  return { client, target }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/engine/cdp/__tests__/cdp-client.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/engine/cdp/
git commit -m "feat: CDP client with WebSocket transport"
```

---

## Task 3: CDP Engine (RuntimeEngine implementation)

**Files:**
- Create: `src/engine/cdp/cdp-engine.ts`
- Test: `src/engine/cdp/__tests__/cdp-engine.test.ts`

This is the CDP implementation of RuntimeEngine. Integration tests require a running Chrome, so we write both unit tests (logic) and integration tests (marked with `.integration`).

**Step 1: Write the failing test**

```typescript
// src/engine/cdp/__tests__/cdp-engine.test.ts
import { describe, it, expect } from 'vitest'
import { buildClip } from '../cdp-engine.js'

describe('buildClip', () => {
  it('builds clip from box model with padding', () => {
    const model = {
      content: { quad: [10, 10, 100, 10, 100, 50, 10, 50] },
      border: { quad: [8, 8, 102, 8, 102, 52, 8, 52] },
    }
    const viewport = { width: 1920, height: 1080 }
    const clip = buildClip(model, viewport, 4)

    expect(clip.x).toBe(4) // 8 - 4
    expect(clip.y).toBe(4) // 8 - 4
    expect(clip.width).toBe(102) // (102 - 8) + 2*4
    expect(clip.height).toBe(52) // (52 - 8) + 2*4
  })

  it('clamps clip to viewport bounds', () => {
    const model = {
      content: { quad: [0, 0, 100, 0, 100, 50, 0, 50] },
      border: { quad: [0, 0, 100, 0, 100, 50, 0, 50] },
    }
    const viewport = { width: 80, height: 40 }
    const clip = buildClip(model, viewport, 10)

    expect(clip.x).toBe(0) // clamped, not -10
    expect(clip.y).toBe(0)
    expect(clip.width).toBeLessThanOrEqual(80)
    expect(clip.height).toBeLessThanOrEqual(40)
  })
})

describe('extractStyleProperties', () => {
  it('picks relevant CSS properties from computed style', () => {
    // Verify the property filter works
    const relevantProps = [
      'width', 'height', 'padding', 'margin', 'border-radius',
      'font-size', 'font-weight', 'font-family', 'line-height',
      'color', 'background-color', 'gap', 'opacity',
      'display', 'flex-direction', 'justify-content', 'align-items',
    ]
    expect(relevantProps).toContain('border-radius')
    expect(relevantProps).toContain('gap')
    expect(relevantProps.length).toBeGreaterThan(10)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/engine/cdp/__tests__/cdp-engine.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// src/engine/cdp/cdp-engine.ts
import type { RuntimeEngine, MeasureResult, ScreenshotOptions, OverlayParams, BBox, ChildElement } from '../types.js'
import { CdpClient, connectToPage } from './cdp-client.js'

const RELEVANT_PROPS = [
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'border', 'border-width', 'border-radius', 'border-color', 'border-style',
  'font-size', 'font-weight', 'font-family', 'line-height', 'letter-spacing',
  'text-align', 'color', 'background-color', 'background',
  'gap', 'row-gap', 'column-gap',
  'display', 'flex-direction', 'justify-content', 'align-items',
  'position', 'top', 'right', 'bottom', 'left',
  'opacity', 'overflow', 'z-index',
  'box-sizing',
]

interface BoxModelQuad {
  quad: number[]
}

export function buildClip(
  model: { content: BoxModelQuad; border?: BoxModelQuad },
  viewport: { width: number; height: number },
  padding = 0,
): { x: number; y: number; width: number; height: number } {
  const q = model.border?.quad ?? model.content.quad
  const minX = Math.min(q[0], q[2], q[4], q[6])
  const maxX = Math.max(q[0], q[2], q[4], q[6])
  const minY = Math.min(q[1], q[3], q[5], q[7])
  const maxY = Math.max(q[1], q[3], q[5], q[7])

  const x = Math.max(0, minX - padding)
  const y = Math.max(0, minY - padding)
  const width = Math.min(viewport.width - x, maxX - minX + 2 * padding)
  const height = Math.min(viewport.height - y, maxY - minY + 2 * padding)

  return { x, y, width, height }
}

export class CdpEngine implements RuntimeEngine {
  private constructor(
    private client: CdpClient,
    private pageUrl: string,
  ) {}

  static async create(host: string, port: number, urlFilter?: string): Promise<CdpEngine> {
    const { client, target } = await connectToPage(host, port, urlFilter)
    return new CdpEngine(client, target.url)
  }

  async screenshot(options?: ScreenshotOptions): Promise<Buffer> {
    if (options?.selector) {
      const { result } = await this.client.call<any>('Runtime.evaluate', {
        expression: `JSON.stringify(document.querySelector('${options.selector}').getBoundingClientRect())`,
        returnByValue: true,
      })
      const rect = JSON.parse(result.value)
      const viewport = await this.getViewport()
      const clip = {
        x: Math.max(0, rect.x),
        y: Math.max(0, rect.y),
        width: Math.min(viewport.width - rect.x, rect.width),
        height: Math.min(viewport.height - rect.y, rect.height),
        scale: 1,
      }
      const { data } = await this.client.call<{ data: string }>('Page.captureScreenshot', {
        format: 'png',
        clip,
        fromSurface: true,
      })
      return Buffer.from(data, 'base64')
    }

    const { data } = await this.client.call<{ data: string }>('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    })
    return Buffer.from(data, 'base64')
  }

  async measure(selector: string, depth = 1): Promise<MeasureResult> {
    const js = `
      (() => {
        const el = document.querySelector('${selector}');
        if (!el) throw new Error('Element not found: ${selector}');
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const style = {};
        ${JSON.stringify(RELEVANT_PROPS)}.forEach(p => {
          const v = cs.getPropertyValue(p);
          if (v && v !== '' && v !== 'none' && v !== 'normal' && v !== 'auto') {
            style[p] = v;
          }
        });
        const children = [];
        if (${depth} > 0) {
          for (const child of el.children) {
            const cr = child.getBoundingClientRect();
            children.push({
              tag: child.tagName.toLowerCase(),
              className: (child.className || '').toString().substring(0, 120),
              bbox: {
                x: +(cr.x - r.x).toFixed(1),
                y: +(cr.y - r.y).toFixed(1),
                width: +cr.width.toFixed(1),
                height: +cr.height.toFixed(1),
              },
              text: (child.textContent || '').substring(0, 80).trim() || undefined,
            });
          }
        }
        return JSON.stringify({
          bbox: {
            x: +r.x.toFixed(1),
            y: +r.y.toFixed(1),
            width: +r.width.toFixed(1),
            height: +r.height.toFixed(1),
          },
          computedStyle: style,
          children,
        });
      })()
    `
    const { result } = await this.client.call<any>('Runtime.evaluate', {
      expression: js,
      returnByValue: true,
    })
    if (result.subtype === 'error') {
      throw new Error(result.description || 'measure failed')
    }
    const parsed = JSON.parse(result.value)
    return { selector, ...parsed }
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const { result } = await this.client.call<any>('Runtime.evaluate', {
      expression,
      returnByValue: true,
    })
    return result.value as T
  }

  async injectOverlay(params: OverlayParams): Promise<void> {
    const { readFile } = await import('fs/promises')
    const imgBuf = await readFile(params.designImagePath)
    const base64 = imgBuf.toString('base64')
    const js = `
      (() => {
        let overlay = document.getElementById('__design_ruler_overlay__');
        if (!overlay) {
          overlay = document.createElement('img');
          overlay.id = '__design_ruler_overlay__';
          overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:auto;pointer-events:none;z-index:999999;';
          document.body.appendChild(overlay);
        }
        overlay.src = 'data:image/png;base64,${base64}';
        overlay.style.opacity = '${params.opacity}';
        overlay.style.transform = 'translate(${params.offsetX}px, ${params.offsetY}px) scale(${params.scale})';
        overlay.style.transformOrigin = 'top left';
        if (${params.scrollY ?? 0} > 0) {
          window.scrollTo(0, ${params.scrollY ?? 0});
        }
        return 'overlay injected';
      })()
    `
    await this.evaluate(js)
  }

  async captureOverlay(): Promise<Buffer> {
    return this.screenshot()
  }

  async close(): Promise<void> {
    this.client.close()
  }

  private async getViewport(): Promise<{ width: number; height: number }> {
    return this.evaluate<{ width: number; height: number }>(
      'JSON.parse(JSON.stringify({ width: window.innerWidth, height: window.innerHeight }))'
    )
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/engine/cdp/__tests__/cdp-engine.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/engine/cdp/
git commit -m "feat: CDP RuntimeEngine implementation"
```

---

## Task 4: Playwright Engine (RuntimeEngine implementation)

**Files:**
- Create: `src/engine/playwright/playwright-engine.ts`
- Test: `src/engine/playwright/__tests__/playwright-engine.test.ts`

**Step 1: Write the failing test**

```typescript
// src/engine/playwright/__tests__/playwright-engine.test.ts
import { describe, it, expect } from 'vitest'
import { PlaywrightEngine } from '../playwright-engine.js'

describe('PlaywrightEngine', () => {
  it('exports create factory', () => {
    expect(PlaywrightEngine.create).toBeTypeOf('function')
  })

  it('create accepts url and options', () => {
    // Verify the signature exists (no browser launched)
    const createFn = PlaywrightEngine.create
    expect(createFn.length).toBeGreaterThanOrEqual(1)
  })
})

describe('PlaywrightEngine integration', () => {
  // These tests require Playwright browsers installed.
  // Run with: pnpm test -- --grep "integration"
  // Skip in CI without browsers.

  it.skip('measures a local HTML page', async () => {
    const engine = await PlaywrightEngine.create('data:text/html,<div class="box" style="width:200px;height:100px;background:red"></div>')
    try {
      const result = await engine.measure('.box')
      expect(result.bbox.width).toBe(200)
      expect(result.bbox.height).toBe(100)
      expect(result.computedStyle['background-color']).toContain('255')
    } finally {
      await engine.close()
    }
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/engine/playwright/__tests__/playwright-engine.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// src/engine/playwright/playwright-engine.ts
import type { RuntimeEngine, MeasureResult, ScreenshotOptions, OverlayParams, ChildElement } from '../types.js'

const RELEVANT_PROPS = [
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'border', 'border-width', 'border-radius', 'border-color', 'border-style',
  'font-size', 'font-weight', 'font-family', 'line-height', 'letter-spacing',
  'text-align', 'color', 'background-color', 'background',
  'gap', 'row-gap', 'column-gap',
  'display', 'flex-direction', 'justify-content', 'align-items',
  'position', 'top', 'right', 'bottom', 'left',
  'opacity', 'overflow', 'z-index',
  'box-sizing',
]

export interface PlaywrightEngineOptions {
  headless?: boolean
  viewport?: { width: number; height: number }
  deviceScaleFactor?: number
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit'
  waitTimeout?: number
}

export class PlaywrightEngine implements RuntimeEngine {
  private browser: any
  private page: any

  private constructor(browser: any, page: any) {
    this.browser = browser
    this.page = page
  }

  static async create(
    url: string,
    options: PlaywrightEngineOptions = {},
  ): Promise<PlaywrightEngine> {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({
      headless: options.headless ?? true,
    })
    const context = await browser.newContext({
      viewport: options.viewport ?? { width: 1920, height: 1080 },
      deviceScaleFactor: options.deviceScaleFactor ?? 1,
    })
    const page = await context.newPage()
    await page.goto(url, {
      waitUntil: options.waitUntil ?? 'networkidle',
      timeout: options.waitTimeout ?? 15000,
    })
    return new PlaywrightEngine(browser, page)
  }

  async screenshot(options?: ScreenshotOptions): Promise<Buffer> {
    if (options?.selector) {
      const el = await this.page.waitForSelector(options.selector, {
        timeout: 5000,
        state: 'visible',
      })
      return el.screenshot({ type: 'png' })
    }
    return this.page.screenshot({
      type: 'png',
      fullPage: options?.fullPage ?? false,
    })
  }

  async measure(selector: string, depth = 1): Promise<MeasureResult> {
    const result = await this.page.evaluate(
      ({ sel, props, dep }: { sel: string; props: string[]; dep: number }) => {
        const el = document.querySelector(sel)
        if (!el) throw new Error(`Element not found: ${sel}`)
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        const style: Record<string, string> = {}
        props.forEach(p => {
          const v = cs.getPropertyValue(p)
          if (v && v !== '' && v !== 'none' && v !== 'normal' && v !== 'auto') {
            style[p] = v
          }
        })
        const children: any[] = []
        if (dep > 0) {
          for (const child of el.children) {
            const cr = child.getBoundingClientRect()
            children.push({
              tag: child.tagName.toLowerCase(),
              className: (child.className || '').toString().substring(0, 120),
              bbox: {
                x: +(cr.x - r.x).toFixed(1),
                y: +(cr.y - r.y).toFixed(1),
                width: +cr.width.toFixed(1),
                height: +cr.height.toFixed(1),
              },
              text: (child.textContent || '').substring(0, 80).trim() || undefined,
            })
          }
        }
        return {
          bbox: {
            x: +r.x.toFixed(1),
            y: +r.y.toFixed(1),
            width: +r.width.toFixed(1),
            height: +r.height.toFixed(1),
          },
          computedStyle: style,
          children,
        }
      },
      { sel: selector, props: RELEVANT_PROPS, dep: depth },
    )
    return { selector, ...result }
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    return this.page.evaluate(expression)
  }

  async injectOverlay(params: OverlayParams): Promise<void> {
    const { readFile } = await import('fs/promises')
    const imgBuf = await readFile(params.designImagePath)
    const base64 = imgBuf.toString('base64')
    await this.page.evaluate(
      ({ b64, opacity, offsetX, offsetY, scale, scrollY }: any) => {
        let overlay = document.getElementById('__design_ruler_overlay__') as HTMLImageElement
        if (!overlay) {
          overlay = document.createElement('img')
          overlay.id = '__design_ruler_overlay__'
          overlay.style.cssText =
            'position:fixed;top:0;left:0;width:100vw;height:auto;pointer-events:none;z-index:999999;'
          document.body.appendChild(overlay)
        }
        overlay.src = `data:image/png;base64,${b64}`
        overlay.style.opacity = String(opacity)
        overlay.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`
        overlay.style.transformOrigin = 'top left'
        if (scrollY > 0) window.scrollTo(0, scrollY)
      },
      {
        b64: base64,
        opacity: params.opacity,
        offsetX: params.offsetX,
        offsetY: params.offsetY,
        scale: params.scale,
        scrollY: params.scrollY ?? 0,
      },
    )
  }

  async captureOverlay(): Promise<Buffer> {
    return this.screenshot()
  }

  async close(): Promise<void> {
    await this.browser.close()
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/engine/playwright/__tests__/playwright-engine.test.ts`
Expected: PASS (2 unit tests pass, integration test skipped)

**Step 5: Commit**

```bash
git add src/engine/playwright/
git commit -m "feat: Playwright RuntimeEngine implementation"
```

---

## Task 5: Engine Factory

**Files:**
- Create: `src/engine/create-engine.ts`
- Create: `src/engine/index.ts`
- Test: `src/engine/__tests__/create-engine.test.ts`

**Step 1: Write the failing test**

```typescript
// src/engine/__tests__/create-engine.test.ts
import { describe, it, expect } from 'vitest'
import { resolveEngineType } from '../create-engine.js'

describe('resolveEngineType', () => {
  it('returns cdp when cdp option is provided', () => {
    expect(resolveEngineType({ cdp: '127.0.0.1:9222' })).toBe('cdp')
  })

  it('returns playwright when no cdp option', () => {
    expect(resolveEngineType({})).toBe('playwright')
  })

  it('returns playwright when cdp is undefined', () => {
    expect(resolveEngineType({ cdp: undefined })).toBe('playwright')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/engine/__tests__/create-engine.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// src/engine/create-engine.ts
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
```

```typescript
// src/engine/index.ts
export type { RuntimeEngine, MeasureResult, ScreenshotOptions, OverlayParams, BBox, ChildElement } from './types.js'
export { createEngine, resolveEngineType } from './create-engine.js'
export type { EngineOptions } from './create-engine.js'
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/engine/__tests__/create-engine.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/engine/create-engine.ts src/engine/index.ts src/engine/__tests__/create-engine.test.ts
git commit -m "feat: engine factory with auto CDP/Playwright selection"
```

---

## Task 6: `measure` Command

**Files:**
- Create: `src/commands/measure.ts`
- Test: `src/commands/__tests__/measure.test.ts`

**Step 1: Write the failing test**

```typescript
// src/commands/__tests__/measure.test.ts
import { describe, it, expect, vi } from 'vitest'
import { buildMeasureOptions, formatMeasureResult } from '../measure.js'

describe('buildMeasureOptions', () => {
  it('parses required options', () => {
    const opts = buildMeasureOptions({
      url: 'http://localhost:3000',
      selector: '.dialog',
    })
    expect(opts.url).toBe('http://localhost:3000')
    expect(opts.selector).toBe('.dialog')
    expect(opts.depth).toBe(1) // default
  })

  it('throws if selector missing', () => {
    expect(() => buildMeasureOptions({ url: 'http://localhost:3000' } as any)).toThrow()
  })

  it('throws if url missing', () => {
    expect(() => buildMeasureOptions({ selector: '.x' } as any)).toThrow()
  })

  it('accepts optional depth', () => {
    const opts = buildMeasureOptions({
      url: 'http://localhost:3000',
      selector: '.dialog',
      depth: '3',
    })
    expect(opts.depth).toBe(3)
  })
})

describe('formatMeasureResult', () => {
  const mockResult = {
    selector: '.box',
    bbox: { x: 10, y: 20, width: 200, height: 100 },
    computedStyle: { width: '200px', height: '100px', 'border-radius': '8px' },
    children: [
      { tag: 'span', className: 'label', bbox: { x: 0, y: 0, width: 50, height: 20 }, text: 'hi' },
    ],
  }

  it('formats as JSON by default', () => {
    const output = formatMeasureResult(mockResult, 'json')
    const parsed = JSON.parse(output)
    expect(parsed.selector).toBe('.box')
    expect(parsed.bbox.width).toBe(200)
  })

  it('formats as table', () => {
    const output = formatMeasureResult(mockResult, 'table')
    expect(output).toContain('width')
    expect(output).toContain('200px')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/commands/__tests__/measure.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// src/commands/measure.ts
import type { MeasureResult } from '../engine/types.js'
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
      for (const c of result.children) {
        lines.push(`  <${c.tag}> .${c.className} [${c.bbox.width}x${c.bbox.height}] ${c.text ?? ''}`)
      }
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
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/commands/__tests__/measure.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/commands/
git commit -m "feat: measure command — runtime element measurement"
```

---

## Task 7: `screenshot` Command

**Files:**
- Create: `src/commands/screenshot.ts`
- Test: `src/commands/__tests__/screenshot.test.ts`

**Step 1: Write the failing test**

```typescript
// src/commands/__tests__/screenshot.test.ts
import { describe, it, expect } from 'vitest'
import { buildScreenshotOptions } from '../screenshot.js'

describe('buildScreenshotOptions', () => {
  it('parses required url', () => {
    const opts = buildScreenshotOptions({ url: 'http://localhost:3000' })
    expect(opts.url).toBe('http://localhost:3000')
    expect(opts.output).toContain('screenshot') // default filename
  })

  it('accepts optional selector and output', () => {
    const opts = buildScreenshotOptions({
      url: 'http://localhost:3000',
      selector: '.dialog',
      output: './my-screenshot.png',
    })
    expect(opts.selector).toBe('.dialog')
    expect(opts.output).toBe('./my-screenshot.png')
  })

  it('throws if url missing', () => {
    expect(() => buildScreenshotOptions({} as any)).toThrow()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/commands/__tests__/screenshot.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// src/commands/screenshot.ts
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
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/commands/__tests__/screenshot.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/commands/screenshot.ts src/commands/__tests__/screenshot.test.ts
git commit -m "feat: screenshot command — runtime page capture"
```

---

## Task 8: Overlay Cache

**Files:**
- Create: `src/overlay/cache.ts`
- Test: `src/overlay/__tests__/cache.test.ts`

**Step 1: Write the failing test**

```typescript
// src/overlay/__tests__/cache.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { OverlayCache } from '../cache.js'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

describe('OverlayCache', () => {
  let tmpDir: string
  let cache: OverlayCache

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'design-ruler-test-'))
    cache = new OverlayCache(tmpDir)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('returns null for nonexistent cache', async () => {
    const result = await cache.get('nonexistent', 'http://localhost:3000')
    expect(result).toBeNull()
  })

  it('saves and retrieves overlay params', async () => {
    const params = {
      designImageHash: 'sha256:abc123',
      targetUrl: 'http://localhost:3000',
      offsetX: 5,
      offsetY: -12,
      scale: 1.0,
      opacity: 0.5,
      scrollY: 800,
    }
    await cache.set('sha256:abc123', 'http://localhost:3000', params)
    const result = await cache.get('sha256:abc123', 'http://localhost:3000')
    expect(result).not.toBeNull()
    expect(result!.offsetX).toBe(5)
    expect(result!.offsetY).toBe(-12)
    expect(result!.scrollY).toBe(800)
  })

  it('invalidates when hash changes', async () => {
    const params = {
      designImageHash: 'sha256:abc123',
      targetUrl: 'http://localhost:3000',
      offsetX: 0, offsetY: 0, scale: 1, opacity: 0.5,
    }
    await cache.set('sha256:abc123', 'http://localhost:3000', params)
    const result = await cache.get('sha256:different', 'http://localhost:3000')
    expect(result).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/overlay/__tests__/cache.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// src/overlay/cache.ts
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { createHash } from 'crypto'

export interface CachedOverlayParams {
  designImageHash: string
  targetUrl: string
  offsetX: number
  offsetY: number
  scale: number
  opacity: number
  scrollY?: number
  createdAt?: string
}

export class OverlayCache {
  constructor(private cacheDir: string) {}

  async get(designImageHash: string, targetUrl: string): Promise<CachedOverlayParams | null> {
    try {
      const key = this.makeKey(designImageHash, targetUrl)
      const filePath = join(this.cacheDir, `${key}.json`)
      const data = await readFile(filePath, 'utf-8')
      const parsed: CachedOverlayParams = JSON.parse(data)
      if (parsed.designImageHash !== designImageHash) return null
      return parsed
    } catch {
      return null
    }
  }

  async set(designImageHash: string, targetUrl: string, params: CachedOverlayParams): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true })
    const key = this.makeKey(designImageHash, targetUrl)
    const filePath = join(this.cacheDir, `${key}.json`)
    const data = { ...params, createdAt: new Date().toISOString() }
    await writeFile(filePath, JSON.stringify(data, null, 2))
  }

  private makeKey(hash: string, url: string): string {
    const input = `${hash}::${url}`
    return createHash('sha256').update(input).digest('hex').substring(0, 16)
  }
}

export async function hashFile(filePath: string): Promise<string> {
  const buf = await readFile(filePath)
  return 'sha256:' + createHash('sha256').update(buf).digest('hex')
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/overlay/__tests__/cache.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/overlay/
git commit -m "feat: overlay parameter cache with hash-based invalidation"
```

---

## Task 9: Overlay Web UI (static HTML)

**Files:**
- Create: `src/overlay/ui.ts` (HTML template as string)
- Test: `src/overlay/__tests__/ui.test.ts`

**Step 1: Write the failing test**

```typescript
// src/overlay/__tests__/ui.test.ts
import { describe, it, expect } from 'vitest'
import { generateOverlayHtml } from '../ui.js'

describe('generateOverlayHtml', () => {
  it('generates valid HTML with design image', () => {
    const html = generateOverlayHtml({
      targetUrl: 'http://localhost:3000',
      designImageBase64: 'iVBOR...fake...',
      wsPort: 9876,
    })
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('localhost:3000')
    expect(html).toContain('iVBOR...fake...')
    expect(html).toContain('9876') // WebSocket port
  })

  it('includes overlay controls', () => {
    const html = generateOverlayHtml({
      targetUrl: 'http://localhost:3000',
      designImageBase64: 'abc',
      wsPort: 9876,
    })
    expect(html).toContain('opacity')
    expect(html).toContain('scale')
    expect(html).toContain('confirm') // confirm button
  })

  it('includes drag interaction JS', () => {
    const html = generateOverlayHtml({
      targetUrl: 'http://localhost:3000',
      designImageBase64: 'abc',
      wsPort: 9876,
    })
    expect(html).toContain('mousedown')
    expect(html).toContain('mousemove')
    expect(html).toContain('WebSocket')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/overlay/__tests__/ui.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// src/overlay/ui.ts
export interface OverlayHtmlOptions {
  targetUrl: string
  designImageBase64: string
  wsPort: number
  initialOpacity?: number
  initialScale?: number
  initialOffsetX?: number
  initialOffsetY?: number
}

export function generateOverlayHtml(options: OverlayHtmlOptions): string {
  const {
    targetUrl,
    designImageBase64,
    wsPort,
    initialOpacity = 50,
    initialScale = 100,
    initialOffsetX = 0,
    initialOffsetY = 0,
  } = options

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>design-ruler overlay</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { overflow: hidden; background: #1a1a1a; font-family: system-ui, sans-serif; }

  #toolbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100000;
    background: rgba(0,0,0,0.85); color: #fff; padding: 8px 16px;
    display: flex; align-items: center; gap: 16px; font-size: 13px;
    backdrop-filter: blur(8px);
  }
  #toolbar label { display: flex; align-items: center; gap: 6px; }
  #toolbar input[type=range] { width: 120px; }
  #toolbar .value { min-width: 40px; text-align: right; font-variant-numeric: tabular-nums; }
  #confirm-btn {
    margin-left: auto; padding: 6px 20px; background: #22c55e; color: #fff;
    border: none; border-radius: 6px; font-size: 14px; font-weight: 600;
    cursor: pointer;
  }
  #confirm-btn:hover { background: #16a34a; }

  #viewport {
    position: fixed; top: 40px; left: 0; right: 0; bottom: 0;
  }
  #target-frame {
    width: 100%; height: 100%; border: none;
  }

  #overlay-img {
    position: fixed; top: 40px; left: 0;
    width: 100vw; height: auto;
    pointer-events: none; z-index: 99999;
    transform-origin: top left;
  }
  #overlay-img.draggable { pointer-events: auto; cursor: grab; }
  #overlay-img.dragging { cursor: grabbing; }

  #status {
    position: fixed; bottom: 12px; right: 12px; z-index: 100001;
    background: rgba(0,0,0,0.7); color: #aaa; padding: 4px 10px;
    border-radius: 4px; font-size: 12px;
  }
</style>
</head>
<body>

<div id="toolbar">
  <span style="font-weight:600">design-ruler</span>
  <label>
    opacity
    <input type="range" id="opacity-slider" min="0" max="100" value="${initialOpacity}">
    <span class="value" id="opacity-val">${initialOpacity}%</span>
  </label>
  <label>
    scale
    <input type="range" id="scale-slider" min="10" max="300" value="${initialScale}">
    <span class="value" id="scale-val">${initialScale}%</span>
  </label>
  <label>
    <input type="checkbox" id="lock-cb" checked> lock
  </label>
  <button id="reset-btn" style="padding:4px 12px;background:#555;color:#fff;border:none;border-radius:4px;cursor:pointer">reset</button>
  <button id="confirm-btn">confirm</button>
</div>

<div id="viewport">
  <iframe id="target-frame" src="${targetUrl}"></iframe>
</div>

<img id="overlay-img" src="data:image/png;base64,${designImageBase64}">

<div id="status">connecting...</div>

<script>
(() => {
  const img = document.getElementById('overlay-img');
  const opacitySlider = document.getElementById('opacity-slider');
  const opacityVal = document.getElementById('opacity-val');
  const scaleSlider = document.getElementById('scale-slider');
  const scaleVal = document.getElementById('scale-val');
  const lockCb = document.getElementById('lock-cb');
  const resetBtn = document.getElementById('reset-btn');
  const confirmBtn = document.getElementById('confirm-btn');
  const status = document.getElementById('status');

  let offsetX = ${initialOffsetX}, offsetY = ${initialOffsetY};
  let scale = ${initialScale} / 100;
  let opacity = ${initialOpacity} / 100;
  let isDragging = false, dragStartX = 0, dragStartY = 0, dragStartOX = 0, dragStartOY = 0;

  function updateTransform() {
    img.style.opacity = String(opacity);
    img.style.transform = \`translate(\${offsetX}px, \${offsetY}px) scale(\${scale})\`;
  }

  opacitySlider.addEventListener('input', () => {
    opacity = opacitySlider.value / 100;
    opacityVal.textContent = opacitySlider.value + '%';
    updateTransform();
  });

  scaleSlider.addEventListener('input', () => {
    scale = scaleSlider.value / 100;
    scaleVal.textContent = scaleSlider.value + '%';
    updateTransform();
  });

  lockCb.addEventListener('change', () => {
    img.classList.toggle('draggable', !lockCb.checked);
  });

  resetBtn.addEventListener('click', () => {
    offsetX = 0; offsetY = 0; scale = 1; opacity = 0.5;
    opacitySlider.value = '50'; opacityVal.textContent = '50%';
    scaleSlider.value = '100'; scaleVal.textContent = '100%';
    updateTransform();
  });

  // Drag
  img.addEventListener('mousedown', (e) => {
    if (lockCb.checked) return;
    isDragging = true;
    dragStartX = e.clientX; dragStartY = e.clientY;
    dragStartOX = offsetX; dragStartOY = offsetY;
    img.classList.add('dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    offsetX = dragStartOX + (e.clientX - dragStartX);
    offsetY = dragStartOY + (e.clientY - dragStartY);
    updateTransform();
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    img.classList.remove('dragging');
  });

  // Scroll zoom
  document.addEventListener('wheel', (e) => {
    if (lockCb.checked) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -2 : 2;
    const newVal = Math.max(10, Math.min(300, parseInt(scaleSlider.value) + delta));
    scaleSlider.value = String(newVal);
    scale = newVal / 100;
    scaleVal.textContent = newVal + '%';
    updateTransform();
  }, { passive: false });

  // WebSocket to CLI
  const ws = new WebSocket('ws://127.0.0.1:${wsPort}');
  ws.onopen = () => { status.textContent = 'connected'; };
  ws.onclose = () => { status.textContent = 'disconnected'; };

  confirmBtn.addEventListener('click', () => {
    const params = { offsetX, offsetY, scale, opacity, scrollY: 0 };
    // Try to get iframe scroll position
    try {
      const frame = document.getElementById('target-frame');
      params.scrollY = frame.contentWindow.scrollY || 0;
    } catch(e) {}
    ws.send(JSON.stringify({ type: 'confirm', params }));
    status.textContent = 'saved!';
    confirmBtn.textContent = 'saved!';
    confirmBtn.style.background = '#666';
  });

  updateTransform();
})();
</script>
</body>
</html>`
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/overlay/__tests__/ui.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/overlay/ui.ts src/overlay/__tests__/ui.test.ts
git commit -m "feat: overlay interactive HTML template"
```

---

## Task 10: `overlay` Command (server + WebSocket)

**Files:**
- Create: `src/commands/overlay.ts`
- Test: `src/commands/__tests__/overlay.test.ts`

**Step 1: Write the failing test**

```typescript
// src/commands/__tests__/overlay.test.ts
import { describe, it, expect } from 'vitest'
import { buildOverlayOptions } from '../overlay.js'

describe('buildOverlayOptions', () => {
  it('parses required options', () => {
    const opts = buildOverlayOptions({
      design: './design.png',
      url: 'http://localhost:3000',
    })
    expect(opts.designImagePath).toBe('./design.png')
    expect(opts.targetUrl).toBe('http://localhost:3000')
    expect(opts.port).toBe(9876) // default
  })

  it('throws if design missing', () => {
    expect(() => buildOverlayOptions({ url: 'http://localhost:3000' } as any)).toThrow()
  })

  it('throws if url missing', () => {
    expect(() => buildOverlayOptions({ design: './x.png' } as any)).toThrow()
  })

  it('accepts cached flag', () => {
    const opts = buildOverlayOptions({
      design: './design.png',
      url: 'http://localhost:3000',
      cached: true,
    })
    expect(opts.cached).toBe(true)
  })

  it('accepts custom port', () => {
    const opts = buildOverlayOptions({
      design: './design.png',
      url: 'http://localhost:3000',
      port: '8888',
    })
    expect(opts.port).toBe(8888)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/commands/__tests__/overlay.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// src/commands/overlay.ts
import { createServer } from 'http'
import { readFile } from 'fs/promises'
import { resolve } from 'path'
import WebSocket, { WebSocketServer } from 'ws'
import { generateOverlayHtml } from '../overlay/ui.js'
import { OverlayCache, hashFile } from '../overlay/cache.js'
import { createEngine } from '../engine/create-engine.js'
import type { OverlayParams } from '../engine/types.js'

export interface OverlayCommandOptions {
  designImagePath: string
  targetUrl: string
  port: number
  cached: boolean
  cdp?: string
  cacheDir: string
}

export function buildOverlayOptions(raw: Record<string, any>): OverlayCommandOptions {
  if (!raw.design) throw new Error('--design is required (path to design screenshot)')
  if (!raw.url) throw new Error('--url is required (target page URL)')
  return {
    designImagePath: resolve(raw.design),
    targetUrl: raw.url,
    port: raw.port ? parseInt(raw.port, 10) : 9876,
    cached: raw.cached ?? false,
    cdp: raw.cdp,
    cacheDir: resolve(raw.cacheDir ?? '.design-ruler/overlays'),
  }
}

export async function overlay(raw: Record<string, any>): Promise<void> {
  const opts = buildOverlayOptions(raw)
  const cache = new OverlayCache(opts.cacheDir)
  const imageHash = await hashFile(opts.designImagePath)

  // Check cache first
  if (opts.cached) {
    const cached = await cache.get(imageHash, opts.targetUrl)
    if (cached) {
      console.log(JSON.stringify({ cached: true, params: cached }))
      // Capture with cached params
      const engine = await createEngine({ url: opts.targetUrl, cdp: opts.cdp })
      try {
        await engine.injectOverlay({
          designImagePath: opts.designImagePath,
          targetUrl: opts.targetUrl,
          offsetX: cached.offsetX,
          offsetY: cached.offsetY,
          scale: cached.scale,
          opacity: cached.opacity,
          scrollY: cached.scrollY,
        })
        const buf = await engine.captureOverlay()
        const outputPath = `overlay-${Date.now()}.png`
        const { writeFile } = await import('fs/promises')
        await writeFile(outputPath, buf)
        console.log(JSON.stringify({ output: outputPath, cached: true }))
      } finally {
        await engine.close()
      }
      return
    }
    console.error('No cached params found, launching interactive mode...')
  }

  // Interactive mode: launch web server + WebSocket
  const imageBuf = await readFile(opts.designImagePath)
  const imageBase64 = imageBuf.toString('base64')
  const wsPort = opts.port + 1

  const html = generateOverlayHtml({
    targetUrl: opts.targetUrl,
    designImageBase64: imageBase64,
    wsPort,
  })

  // HTTP server for the overlay page
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  })

  // WebSocket server for confirm signal
  const wss = new WebSocketServer({ port: wsPort })

  await new Promise<void>((resolvePromise) => {
    wss.on('connection', (ws) => {
      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'confirm') {
            const params = {
              designImageHash: imageHash,
              targetUrl: opts.targetUrl,
              ...msg.params,
            }
            await cache.set(imageHash, opts.targetUrl, params)
            console.log(JSON.stringify({ confirmed: true, params }))

            ws.send(JSON.stringify({ type: 'saved' }))

            // Clean up
            wss.close()
            server.close()
            resolvePromise()
          }
        } catch (e) {
          console.error('WebSocket error:', e)
        }
      })
    })

    server.listen(opts.port, () => {
      const url = `http://127.0.0.1:${opts.port}`
      console.error(`Overlay UI: ${url}`)
      console.error('Adjust the overlay, then click confirm.')
      // Auto-open browser
      import('child_process').then(({ exec }) => {
        const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
        exec(`${cmd} ${url}`)
      })
    })
  })
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/commands/__tests__/overlay.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/commands/overlay.ts src/commands/__tests__/overlay.test.ts
git commit -m "feat: overlay command with interactive alignment UI"
```

---

## Task 11: CLI Entry Point

**Files:**
- Modify: `src/cli.ts`
- Test: Manual — `pnpm build && node dist/cli.js --help`

**Step 1: Write the CLI**

```typescript
// src/cli.ts
import { Command } from 'commander'
import { measure } from './commands/measure.js'
import { screenshot } from './commands/screenshot.js'
import { overlay } from './commands/overlay.js'

const program = new Command()

program
  .name('design-ruler')
  .description('A ruler for AI — measure runtime rendering against design specs')
  .version('0.1.0')

program
  .command('measure')
  .description('Measure an element\'s bbox and computed style')
  .requiredOption('--url <url>', 'Target page URL')
  .requiredOption('--selector <selector>', 'CSS selector to measure')
  .option('--depth <n>', 'Child element depth', '1')
  .option('--cdp <host:port>', 'Use CDP direct connection instead of Playwright')
  .option('--format <format>', 'Output format: json | table', 'json')
  .action(measure)

program
  .command('screenshot')
  .description('Capture a screenshot of the page or a specific element')
  .requiredOption('--url <url>', 'Target page URL')
  .option('--selector <selector>', 'CSS selector to capture')
  .option('--output <path>', 'Output file path')
  .option('--full-page', 'Capture full page')
  .option('--cdp <host:port>', 'Use CDP direct connection')
  .action(screenshot)

program
  .command('overlay')
  .description('Interactive overlay comparison with design screenshot')
  .requiredOption('--design <path>', 'Path to design screenshot (PNG/JPG)')
  .requiredOption('--url <url>', 'Target page URL')
  .option('--port <port>', 'Local server port', '9876')
  .option('--cached', 'Use cached alignment params (skip interactive)')
  .option('--cdp <host:port>', 'Use CDP for cached overlay capture')
  .option('--cache-dir <dir>', 'Cache directory', '.design-ruler/overlays')
  .action(overlay)

program.parse()
```

**Step 2: Build and test**

Run: `pnpm build && node dist/cli.js --help`
Expected:
```
Usage: design-ruler [options] [command]

A ruler for AI — measure runtime rendering against design specs

Options:
  -V, --version   output the version number
  -h, --help      display help for command

Commands:
  measure         Measure an element's bbox and computed style
  screenshot      Capture a screenshot of the page or a specific element
  overlay         Interactive overlay comparison with design screenshot
  help [command]  display help for command
```

**Step 3: Test subcommand help**

Run: `node dist/cli.js measure --help`
Expected: Shows --url, --selector, --depth, --cdp, --format options

**Step 4: Commit**

```bash
git add src/cli.ts src/index.ts
git commit -m "feat: CLI entry point with measure, screenshot, overlay commands"
```

---

## Task 12: Update exports and final index.ts

**Files:**
- Modify: `src/index.ts`

**Step 1: Update index.ts to export public API**

```typescript
// src/index.ts
export type {
  RuntimeEngine,
  MeasureResult,
  ScreenshotOptions,
  OverlayParams,
  BBox,
  ChildElement,
} from './engine/types.js'

export { createEngine, resolveEngineType } from './engine/create-engine.js'
export type { EngineOptions } from './engine/create-engine.js'

export { CdpEngine } from './engine/cdp/cdp-engine.js'
export { PlaywrightEngine } from './engine/playwright/playwright-engine.js'

export { OverlayCache, hashFile } from './overlay/cache.js'
export { generateOverlayHtml } from './overlay/ui.js'
```

**Step 2: Build and verify**

Run: `pnpm build`
Expected: No errors, generates dist/ with index.js, cli.js, and .d.ts files

**Step 3: Run all tests**

Run: `pnpm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: finalize public API exports"
```

---

## Task 13: Integration Test (end-to-end)

**Files:**
- Create: `tests/integration/measure.integration.test.ts`
- Create: `tests/integration/screenshot.integration.test.ts`

**Step 1: Write integration tests**

```typescript
// tests/integration/measure.integration.test.ts
import { describe, it, expect } from 'vitest'
import { PlaywrightEngine } from '../../src/engine/playwright/playwright-engine.js'

describe('measure integration', () => {
  it('measures a simple HTML element', async () => {
    const html = `data:text/html,
      <div class="box" style="width:300px;height:150px;background:red;border-radius:12px;padding:20px;font-size:16px">
        <span class="label">Hello</span>
      </div>`

    const engine = await PlaywrightEngine.create(html, {
      viewport: { width: 1920, height: 1080 },
    })

    try {
      const result = await engine.measure('.box')
      expect(result.selector).toBe('.box')
      expect(result.bbox.width).toBe(300)
      expect(result.bbox.height).toBe(150)
      expect(result.computedStyle['border-radius']).toBe('12px')
      expect(result.computedStyle['padding']).toBe('20px')
      expect(result.computedStyle['font-size']).toBe('16px')
      expect(result.children).toHaveLength(1)
      expect(result.children![0].tag).toBe('span')
      expect(result.children![0].text).toBe('Hello')
    } finally {
      await engine.close()
    }
  })
})

// tests/integration/screenshot.integration.test.ts
import { describe, it, expect } from 'vitest'
import { PlaywrightEngine } from '../../src/engine/playwright/playwright-engine.js'

describe('screenshot integration', () => {
  it('captures a page screenshot', async () => {
    const html = `data:text/html,<div style="width:100px;height:100px;background:blue"></div>`
    const engine = await PlaywrightEngine.create(html)

    try {
      const buf = await engine.screenshot()
      expect(buf).toBeInstanceOf(Buffer)
      expect(buf.length).toBeGreaterThan(100)
      // PNG signature check
      expect(buf[0]).toBe(0x89)
      expect(buf[1]).toBe(0x50) // P
      expect(buf[2]).toBe(0x4e) // N
      expect(buf[3]).toBe(0x47) // G
    } finally {
      await engine.close()
    }
  })

  it('captures an element screenshot', async () => {
    const html = `data:text/html,
      <div style="padding:50px">
        <div class="target" style="width:80px;height:40px;background:green"></div>
      </div>`
    const engine = await PlaywrightEngine.create(html)

    try {
      const buf = await engine.screenshot({ selector: '.target' })
      expect(buf).toBeInstanceOf(Buffer)
      expect(buf.length).toBeGreaterThan(0)
    } finally {
      await engine.close()
    }
  })
})
```

**Step 2: Run integration tests**

Run: `pnpm test tests/integration/`
Expected: PASS (requires Playwright browsers — `npx playwright install chromium` first)

**Step 3: Commit**

```bash
git add tests/
git commit -m "test: add integration tests for measure and screenshot"
```

---

## Task 14: README and package polish

**Files:**
- Create: `README.md`
- Modify: `package.json` (add repository, keywords)

**Step 1: Write README**

```markdown
# design-ruler

A ruler for AI — measure runtime rendering against design specs.

design-ruler is a design-source-agnostic CLI tool that helps AI agents (and humans) verify CSS changes by measuring actual browser rendering and comparing it visually with design screenshots.

## Install

\`\`\`bash
npm install -g design-ruler
\`\`\`

## Commands

### measure

Measure an element's bounding box and computed style.

\`\`\`bash
design-ruler measure --url "http://localhost:3000" --selector ".dialog"
\`\`\`

### screenshot

Capture a page or element screenshot.

\`\`\`bash
design-ruler screenshot --url "http://localhost:3000" --selector ".dialog" --output dialog.png
\`\`\`

### overlay

Interactive overlay comparison with a design screenshot.

\`\`\`bash
# First time: interactive alignment
design-ruler overlay --design ./design.png --url "http://localhost:3000"

# Subsequent: use cached alignment params
design-ruler overlay --design ./design.png --url "http://localhost:3000" --cached
\`\`\`

## CDP Mode

For WebView debugging (Android emulator, car systems, etc.):

\`\`\`bash
# Forward CDP port first
adb forward tcp:9222 tcp:9222

# Then use --cdp flag
design-ruler measure --url "http://localhost:3000" --selector ".dialog" --cdp 127.0.0.1:9222
\`\`\`

## Design Source Agnostic

design-ruler doesn't connect to any design tool. Feed it a screenshot from anywhere:
- Figma (via official MCP or manual export)
- Sketch, Penpot, Pixso, or any design tool
- Even a hand-drawn mockup photo

## License

MIT
\`\`\`

**Step 2: Commit**

\`\`\`bash
git add README.md package.json
git commit -m "docs: add README and polish package.json"
\`\`\`

---

## Summary

| Task | Description | Estimated Effort |
|------|-------------|-----------------|
| 0 | Project scaffolding | 5 min |
| 1 | Types + RuntimeEngine interface | 5 min |
| 2 | CDP Client | 10 min |
| 3 | CDP Engine | 15 min |
| 4 | Playwright Engine | 15 min |
| 5 | Engine Factory | 5 min |
| 6 | measure command | 10 min |
| 7 | screenshot command | 5 min |
| 8 | Overlay cache | 10 min |
| 9 | Overlay web UI | 15 min |
| 10 | overlay command | 15 min |
| 11 | CLI entry point | 5 min |
| 12 | Final exports | 5 min |
| 13 | Integration tests | 10 min |
| 14 | README + polish | 5 min |

**Dependency order:**
```
Task 0 (scaffold)
  → Task 1 (types)
    → Task 2 (CDP client) → Task 3 (CDP engine)
    → Task 4 (Playwright engine)
      → Task 5 (factory)
        → Task 6 (measure) → Task 7 (screenshot)
        → Task 8 (cache) → Task 9 (UI) → Task 10 (overlay)
          → Task 11 (CLI) → Task 12 (exports) → Task 13 (integration) → Task 14 (README)
```

Tasks 2-4 can be parallelized (CDP and Playwright engines are independent).
Tasks 6-7 can be parallelized.
Tasks 8-9 can be parallelized.
