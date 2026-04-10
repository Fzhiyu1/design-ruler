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
