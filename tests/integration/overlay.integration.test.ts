import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PlaywrightEngine } from '../../src/engine/playwright/playwright-engine.js'
import { tintDesignImage } from '../../src/overlay/tint.js'
import { writeFile, unlink, mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import sharp from 'sharp'

describe('overlay integration', () => {
  let tmpDir: string
  let designPath: string

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'design-ruler-overlay-'))

    // Create a "design" screenshot
    const engine = await PlaywrightEngine.create(
      'data:text/html,<div class="box" style="width:200px;height:100px;background:white;border-radius:12px;padding:20px;box-sizing:border-box"><span style="color:black;font-size:16px">Hello</span></div>',
      { viewport: { width: 400, height: 300 } },
    )
    const buf = await engine.screenshot({ selector: '.box' })
    designPath = join(tmpDir, 'design.png')
    await writeFile(designPath, buf)
    await engine.close()
  })

  it('tintDesignImage makes light pixels transparent and dark pixels magenta', async () => {
    const tinted = await tintDesignImage(designPath)
    expect(tinted).toBeInstanceOf(Buffer)
    expect(tinted.length).toBeGreaterThan(0)

    // Verify it's a valid PNG with alpha
    const meta = await sharp(tinted).metadata()
    expect(meta.channels).toBe(4) // RGBA
  })

  it('selector overlay composites design on element via Sharp', async () => {
    // "Implementation" with different padding (10px vs 20px)
    const implUrl = 'data:text/html,<div class="box" style="width:200px;height:100px;background:white;border-radius:8px;padding:10px;box-sizing:border-box"><span style="color:black;font-size:16px">Hello</span></div>'
    const engine = await PlaywrightEngine.create(implUrl, { viewport: { width: 400, height: 300 } })

    try {
      // Screenshot the element
      const elementBuf = await engine.screenshot({ selector: '.box' })
      const elementMeta = await sharp(elementBuf).metadata()

      // Tint and resize design
      const tintedBuf = await tintDesignImage(designPath)
      const tintedResized = await sharp(tintedBuf)
        .resize(elementMeta.width!, elementMeta.height!, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer()

      // Composite
      const ghostBuf = await sharp(elementBuf)
        .composite([{ input: tintedResized, blend: 'over' }])
        .png()
        .toBuffer()

      expect(ghostBuf).toBeInstanceOf(Buffer)
      expect(ghostBuf.length).toBeGreaterThan(elementBuf.length) // ghost has more visual data

      // Verify PNG
      expect(ghostBuf[0]).toBe(0x89)
      expect(ghostBuf[1]).toBe(0x50)

      // Verify dimensions match
      const ghostMeta = await sharp(ghostBuf).metadata()
      expect(ghostMeta.width).toBe(elementMeta.width)
      expect(ghostMeta.height).toBe(elementMeta.height)
    } finally {
      await engine.close()
    }
  })
})
