import { createServer } from 'http'
import { writeFile, mkdir } from 'fs/promises'
import { resolve, dirname } from 'path'
import WebSocket, { WebSocketServer } from 'ws'
import { generateOverlayHtml } from '../overlay/ui.js'
import { createEngine } from '../engine/create-engine.js'

export interface OverlayCommandOptions {
  designImagePath: string
  targetUrl: string
  port: number
  cdp?: string
  output?: string
  selector?: string
  offsetX?: number
  offsetY?: number
  scale?: number
  opacity?: number
}

export function buildOverlayOptions(raw: Record<string, any>): OverlayCommandOptions {
  if (!raw.design) throw new Error('--design is required (path to design screenshot)')
  if (!raw.url) throw new Error('--url is required (target page URL)')

  return {
    designImagePath: resolve(raw.design),
    targetUrl: raw.url,
    port: raw.port ? parseInt(raw.port, 10) : 9876,
    cdp: raw.cdp,
    output: raw.output,
    selector: raw.selector,
    offsetX: raw.offsetX != null ? parseFloat(raw.offsetX) : undefined,
    offsetY: raw.offsetY != null ? parseFloat(raw.offsetY) : undefined,
    scale: raw.scale != null ? parseFloat(raw.scale) : undefined,
    opacity: raw.opacity != null ? parseFloat(raw.opacity) : undefined,
  }
}

async function captureGhost(opts: OverlayCommandOptions, params: { offsetX: number; offsetY: number; scale: number; opacity: number }): Promise<void> {
  const engine = await createEngine({ url: opts.targetUrl, cdp: opts.cdp })
  try {
    await engine.injectOverlay({
      designImagePath: opts.designImagePath,
      targetUrl: opts.targetUrl,
      offsetX: params.offsetX,
      offsetY: params.offsetY,
      scale: params.scale,
      opacity: params.opacity,
    })
    const buf = await engine.captureOverlay()
    const outputPath = opts.output ?? `overlay-${Date.now()}.png`
    await mkdir(dirname(resolve(outputPath)), { recursive: true }).catch(() => {})
    await writeFile(outputPath, buf)
    console.log(JSON.stringify({ output: outputPath, bytes: buf.length }))
  } finally {
    await engine.close()
  }
}

/**
 * Selector mode: screenshot element + Sharp composite with tinted design.
 * No CSS positioning — pure pixel-level compositing for zero precision loss.
 */
async function compositeGhost(opts: OverlayCommandOptions): Promise<void> {
  const sharp = (await import('sharp')).default
  const { tintDesignImage } = await import('../overlay/tint.js')

  const engine = await createEngine({ url: opts.targetUrl, cdp: opts.cdp })
  let elementBuf: Buffer
  try {
    elementBuf = await engine.screenshot({ selector: opts.selector })
  } finally {
    await engine.close()
  }

  const elementMeta = await sharp(elementBuf).metadata()
  const ew = elementMeta.width!
  const eh = elementMeta.height!

  const tintedBuf = await tintDesignImage(opts.designImagePath)
  const tintedResized = await sharp(tintedBuf)
    .resize(ew, eh, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer()

  const ghostBuf = await sharp(elementBuf)
    .composite([{ input: tintedResized, blend: 'over' }])
    .png()
    .toBuffer()

  const outputPath = opts.output ?? `overlay-${Date.now()}.png`
  await mkdir(dirname(resolve(outputPath)), { recursive: true }).catch(() => {})
  await writeFile(outputPath, ghostBuf)
  console.log(JSON.stringify({ output: outputPath, bytes: ghostBuf.length, selector: opts.selector, elementSize: { width: ew, height: eh } }))
}

export async function overlay(raw: Record<string, any>): Promise<void> {
  const opts = buildOverlayOptions(raw)

  // Selector mode — Sharp composite, pixel-precise
  if (opts.selector) {
    await compositeGhost(opts)
    return
  }

  // Direct params — headless, no interaction
  if (opts.offsetX != null || opts.offsetY != null) {
    await captureGhost(opts, {
      offsetX: opts.offsetX ?? 0,
      offsetY: opts.offsetY ?? 0,
      scale: opts.scale ?? 1,
      opacity: opts.opacity ?? 1,
    })
    return
  }

  // Interactive alignment UI
  const { tintDesignImage } = await import('../overlay/tint.js')
  const tintedBuf = await tintDesignImage(opts.designImagePath)
  const imageBase64 = tintedBuf.toString('base64')
  const wsPort = opts.port + 1

  const html = generateOverlayHtml({
    targetUrl: opts.targetUrl,
    designImageBase64: imageBase64,
    wsPort,
  })

  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  })

  const wss = new WebSocketServer({ port: wsPort })

  await new Promise<void>((resolvePromise) => {
    wss.on('connection', (ws) => {
      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'confirm') {
            console.log(JSON.stringify({ confirmed: true, params: msg.params }))
            ws.send(JSON.stringify({ type: 'saved' }))
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
      import('child_process').then(({ exec }) => {
        const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
        exec(`${cmd} ${url}`)
      })
    })
  })
}
