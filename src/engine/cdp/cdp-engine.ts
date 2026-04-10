import type { RuntimeEngine, MeasureResult, ScreenshotOptions, OverlayParams } from '../types.js'
import { RELEVANT_PROPS } from '../constants.js'
import { CdpClient, connectToPage } from './cdp-client.js'

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
  const width = Math.min(viewport.width, maxX + padding) - x
  const height = Math.min(viewport.height, maxY + padding) - y

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
      // Use JSON.stringify to safely escape the selector
      const safeSelector = JSON.stringify(options.selector)
      const { result } = await this.client.call<any>('Runtime.evaluate', {
        expression: `(() => {
          const el = document.querySelector(${safeSelector});
          if (!el) throw new Error('Element not found: ' + ${safeSelector});
          return JSON.stringify(el.getBoundingClientRect());
        })()`,
        returnByValue: true,
      })
      if (result.subtype === 'error') {
        throw new Error(result.description || `Element not found: ${options.selector}`)
      }
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
    // All user inputs passed via JSON.stringify to prevent injection
    const safeSelector = JSON.stringify(selector)
    const safeProps = JSON.stringify(RELEVANT_PROPS)
    const safeDepth = Number(depth) || 1

    const js = `
      (() => {
        function collectChildren(parent, parentRect, currentDepth, maxDepth) {
          if (currentDepth >= maxDepth) return [];
          const result = [];
          for (const child of parent.children) {
            const cr = child.getBoundingClientRect();
            const node = {
              tag: child.tagName.toLowerCase(),
              className: (child.className || '').toString().substring(0, 120),
              bbox: {
                x: +(cr.x - parentRect.x).toFixed(1),
                y: +(cr.y - parentRect.y).toFixed(1),
                width: +cr.width.toFixed(1),
                height: +cr.height.toFixed(1),
              },
              text: (child.textContent || '').substring(0, 80).trim() || undefined,
            };
            if (currentDepth + 1 < maxDepth && child.children.length > 0) {
              node.children = collectChildren(child, cr, currentDepth + 1, maxDepth);
            }
            result.push(node);
          }
          return result;
        }

        const sel = ${safeSelector};
        const el = document.querySelector(sel);
        if (!el) throw new Error('Element not found: ' + sel);
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const style = {};
        ${safeProps}.forEach(p => {
          const v = cs.getPropertyValue(p);
          if (v && v !== '' && v !== 'none' && v !== 'normal' && v !== 'auto') {
            style[p] = v;
          }
        });
        return JSON.stringify({
          bbox: {
            x: +r.x.toFixed(1),
            y: +r.y.toFixed(1),
            width: +r.width.toFixed(1),
            height: +r.height.toFixed(1),
          },
          computedStyle: style,
          children: ${safeDepth} > 0 ? collectChildren(el, r, 0, ${safeDepth}) : [],
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
    const { tintDesignImage } = await import('../../overlay/tint.js')
    const tintedBuf = await tintDesignImage(params.designImagePath)
    const base64 = tintedBuf.toString('base64')
    // Numeric params are safe, base64 is safe, no user strings interpolated
    const js = `
      (() => {
        let overlay = document.getElementById('__design_ruler_overlay__');
        if (!overlay) {
          overlay = document.createElement('img');
          overlay.id = '__design_ruler_overlay__';
          overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:auto;pointer-events:none;z-index:999999;';
          document.body.appendChild(overlay);
        }
        overlay.src = 'data:image/png;base64,' + ${JSON.stringify(base64)};
        overlay.style.opacity = String(${Number(params.opacity)});
        overlay.style.transform = 'translate(' + ${Number(params.offsetX)} + 'px, ' + ${Number(params.offsetY)} + 'px) scale(' + ${Number(params.scale)} + ')';
        overlay.style.transformOrigin = 'top left';
        if (${Number(params.scrollY ?? 0)} > 0) {
          window.scrollTo(0, ${Number(params.scrollY ?? 0)});
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
