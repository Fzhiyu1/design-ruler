import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// 1x1 PNG — returned by the mocked image_generation tool.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAQDJ/oXqAAAAAElFTkSuQmCC'

const generateTextMock = vi.fn(async () => ({
  staticToolResults: [{ toolName: 'image_generation', output: { result: PNG_B64 } }],
}))

vi.mock('ai', () => ({ generateText: generateTextMock }))
vi.mock('@ai-sdk/openai', () => ({
  openai: { tools: { imageGeneration: (o: any) => o } },
}))

import { edit, DEFAULT_TOOL_LLM } from '../gateway.js'

let tmp: string
let ref: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'dr-tool-'))
  ref = join(tmp, 'ref.png')
  writeFileSync(ref, Buffer.from(PNG_B64, 'base64'))
  generateTextMock.mockClear()
})
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); vi.unstubAllGlobals() })

describe('edit routing: image-only models → GPT-5 + image_generation tool', () => {
  it('routes openai/gpt-image-2 to the tool path and writes the returned image', async () => {
    const out = join(tmp, 'o.png')
    const result = await edit({ apiKey: 'vck_x', prompt: 'redesign this', ref, out, model: 'openai/gpt-image-2' })

    // used the AI SDK (tool path), not fetch
    expect(generateTextMock).toHaveBeenCalledOnce()
    expect(generateTextMock.mock.calls[0][0].model).toBe(DEFAULT_TOOL_LLM)

    expect(result.mode).toBe('edit')
    expect(result.model).toContain('openai/gpt-image-2')
    expect(result.model).toContain('image_generation tool')
    expect(result.bytes).toBeGreaterThan(0)
    expect(readFileSync(out).length).toBe(result.bytes)
  })

  it('passes the API key to the gateway provider via env', async () => {
    await edit({ apiKey: 'vck_routed', prompt: 'p', ref, out: join(tmp, 'o2.png'), model: 'openai/gpt-image-2' })
    expect(process.env.AI_GATEWAY_API_KEY).toBe('vck_routed')
  })

  it('throws when ref is missing (pre-flight, before any SDK call)', async () => {
    await expect(
      edit({ apiKey: 'k', prompt: 'p', ref: join(tmp, 'nope.png'), out: join(tmp, 'o.png'), model: 'openai/gpt-image-2' }),
    ).rejects.toThrow(/not found/i)
    expect(generateTextMock).not.toHaveBeenCalled()
  })
})
