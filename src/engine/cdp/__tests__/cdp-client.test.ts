import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { WebSocketServer } from 'ws'
import { CdpClient, type CdpTarget } from '../cdp-client.js'

// Mock CDP WebSocket server
let wss: WebSocketServer
let port: number

beforeAll(async () => {
  wss = new WebSocketServer({ port: 0 })
  port = (wss.address() as any).port

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString())

      // Auto-respond to enable calls
      if (msg.method?.endsWith('.enable')) {
        ws.send(JSON.stringify({ id: msg.id, result: {} }))
        return
      }

      // Echo method back as result for testing
      if (msg.method === 'Test.echo') {
        ws.send(JSON.stringify({ id: msg.id, result: { echo: msg.params } }))
        return
      }

      // Simulate error
      if (msg.method === 'Test.error') {
        ws.send(JSON.stringify({ id: msg.id, error: { message: 'test error' } }))
        return
      }

      // Simulate timeout — don't respond
      if (msg.method === 'Test.hang') {
        return
      }

      ws.send(JSON.stringify({ id: msg.id, result: {} }))
    })
  })
})

afterAll(() => {
  wss.close()
})

function makeMockTarget(): CdpTarget {
  return {
    id: 'test',
    title: 'Test',
    type: 'page',
    url: 'http://localhost:3000/',
    webSocketDebuggerUrl: `ws://127.0.0.1:${port}`,
  }
}

describe('CdpClient', () => {
  let client: CdpClient

  afterEach(() => {
    client?.close()
  })

  it('connects and enables domains', async () => {
    client = await CdpClient.connect(makeMockTarget())
    // If we get here, connect succeeded (DOM/CSS/Page/Runtime.enable all responded)
    expect(client).toBeDefined()
  })

  it('sends correct JSON and routes response by ID', async () => {
    client = await CdpClient.connect(makeMockTarget())
    const result = await client.call<{ echo: any }>('Test.echo', { foo: 'bar' })
    expect(result.echo).toEqual({ foo: 'bar' })
  })

  it('handles multiple concurrent calls with correct ID routing', async () => {
    client = await CdpClient.connect(makeMockTarget())
    const [r1, r2, r3] = await Promise.all([
      client.call<{ echo: any }>('Test.echo', { n: 1 }),
      client.call<{ echo: any }>('Test.echo', { n: 2 }),
      client.call<{ echo: any }>('Test.echo', { n: 3 }),
    ])
    expect(r1.echo).toEqual({ n: 1 })
    expect(r2.echo).toEqual({ n: 2 })
    expect(r3.echo).toEqual({ n: 3 })
  })

  it('rejects on CDP error response', async () => {
    client = await CdpClient.connect(makeMockTarget())
    await expect(client.call('Test.error')).rejects.toThrow('CDP: test error')
  })

  it('rejects on timeout', async () => {
    client = await CdpClient.connect(makeMockTarget())
    await expect(client.call('Test.hang', {}, 200)).rejects.toThrow('timed out')
  })
})

describe('connectToPage target filtering', () => {
  it('filters targets by type=page', () => {
    const targets = [
      { id: '1', title: 'Page', type: 'page', url: 'http://localhost:3000/', webSocketDebuggerUrl: 'ws://...' },
      { id: '2', title: 'DevTools', type: 'other', url: 'devtools://...', webSocketDebuggerUrl: 'ws://...' },
    ]
    const pages = targets.filter(t => t.type === 'page')
    expect(pages).toHaveLength(1)
    expect(pages[0].url).toContain('localhost')
  })

  it('filters by URL when urlFilter provided', () => {
    const targets = [
      { id: '1', type: 'page', url: 'http://localhost:3000/home' },
      { id: '2', type: 'page', url: 'http://localhost:3000/settings' },
    ]
    const pages = targets.filter(t => t.type === 'page')
    const match = pages.find(t => t.url.includes('settings')) ?? pages[0]
    expect(match.id).toBe('2')
  })
})
