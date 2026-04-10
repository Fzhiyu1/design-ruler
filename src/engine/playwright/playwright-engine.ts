import type { RuntimeEngine, MeasureResult, ScreenshotOptions, OverlayParams } from '../types.js'
import { RELEVANT_PROPS } from '../constants.js'

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
      ({ sel, props, maxDepth }: { sel: string; props: string[]; maxDepth: number }) => {
        function collectChildren(parent: Element, parentRect: DOMRect, currentDepth: number, maxDep: number): any[] {
          if (currentDepth >= maxDep) return []
          const result: any[] = []
          for (const child of parent.children) {
            const cr = child.getBoundingClientRect()
            const node: any = {
              tag: child.tagName.toLowerCase(),
              className: (child.className || '').toString().substring(0, 120),
              bbox: {
                x: +(cr.x - parentRect.x).toFixed(1),
                y: +(cr.y - parentRect.y).toFixed(1),
                width: +cr.width.toFixed(1),
                height: +cr.height.toFixed(1),
              },
              text: (child.textContent || '').substring(0, 80).trim() || undefined,
            }
            if (currentDepth + 1 < maxDep && child.children.length > 0) {
              node.children = collectChildren(child, cr, currentDepth + 1, maxDep)
            }
            result.push(node)
          }
          return result
        }

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
        return {
          bbox: {
            x: +r.x.toFixed(1),
            y: +r.y.toFixed(1),
            width: +r.width.toFixed(1),
            height: +r.height.toFixed(1),
          },
          computedStyle: style,
          children: maxDepth > 0 ? collectChildren(el, r, 0, maxDepth) : [],
        }
      },
      { sel: selector, props: RELEVANT_PROPS, maxDepth: depth },
    )
    return { selector, ...result }
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    return this.page.evaluate(expression)
  }

  async injectOverlay(params: OverlayParams): Promise<void> {
    const { tintDesignImage } = await import('../../overlay/tint.js')
    const tintedBuf = await tintDesignImage(params.designImagePath)
    const base64 = tintedBuf.toString('base64')
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
