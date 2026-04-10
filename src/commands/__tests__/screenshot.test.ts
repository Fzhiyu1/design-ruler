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
