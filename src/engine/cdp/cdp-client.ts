import WebSocket from 'ws'

export interface CdpTarget {
  id: string
  title: string
  type: string
  url: string
  webSocketDebuggerUrl: string
}

export async function listTargets(host: string, port: number): Promise<CdpTarget[]> {
  const res = await fetch(`http://${host}:${port}/json`)
  if (!res.ok) throw new Error(`CDP target list failed: ${res.status}`)
  return res.json() as Promise<CdpTarget[]>
}

export class CdpClient {
  private ws: WebSocket
  private nextId = 1
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  private ready: Promise<void>

  private constructor(wsUrl: string) {
    this.ws = new WebSocket(wsUrl)
    this.ready = new Promise((resolve, reject) => {
      this.ws.once('open', resolve)
      this.ws.once('error', reject)
    })
    this.ws.on('message', (data: WebSocket.Data) => {
      const payload = JSON.parse(data.toString())
      if (payload.id != null) {
        const p = this.pending.get(payload.id)
        if (p) {
          this.pending.delete(payload.id)
          if (payload.error) {
            p.reject(new Error(`CDP: ${payload.error.message}`))
          } else {
            p.resolve(payload.result)
          }
        }
      }
    })
    this.ws.on('close', () => {
      for (const p of this.pending.values()) {
        p.reject(new Error('CDP connection closed'))
      }
      this.pending.clear()
    })
  }

  static async connect(target: CdpTarget): Promise<CdpClient> {
    const client = new CdpClient(target.webSocketDebuggerUrl)
    await client.ready
    await client.call('DOM.enable')
    await client.call('CSS.enable')
    await client.call('Page.enable')
    await client.call('Runtime.enable')
    return client
  }

  async call<T = any>(method: string, params?: Record<string, unknown>, timeout = 30000): Promise<T> {
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP call '${method}' timed out after ${timeout}ms`))
      }, timeout)
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v) },
        reject: (e) => { clearTimeout(timer); reject(e) },
      })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  close(): void {
    this.ws.close()
  }
}

export async function connectToPage(
  host: string,
  port: number,
  urlFilter?: string,
): Promise<{ client: CdpClient; target: CdpTarget }> {
  const targets = await listTargets(host, port)
  const pages = targets.filter(t => t.type === 'page')
  if (pages.length === 0) throw new Error('No page targets found')

  const target = urlFilter
    ? pages.find(t => t.url.includes(urlFilter)) ?? pages[0]
    : pages[0]

  const client = await CdpClient.connect(target)
  return { client, target }
}
