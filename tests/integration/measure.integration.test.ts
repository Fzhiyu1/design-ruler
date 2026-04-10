import { describe, it, expect } from 'vitest'
import { PlaywrightEngine } from '../../src/engine/playwright/playwright-engine.js'

describe('measure integration', () => {
  it('measures a simple HTML element', async () => {
    const html = `data:text/html,
      <div class="box" style="box-sizing:border-box;width:300px;height:150px;background:red;border-radius:12px;padding:20px;font-size:16px">
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
