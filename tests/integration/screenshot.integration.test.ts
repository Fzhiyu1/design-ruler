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
