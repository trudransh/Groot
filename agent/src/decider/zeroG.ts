import type { CheckpointContext } from '../types.js'
import type { Decider, DeciderResult, ZeroGPort } from './types.js'
import { parseDecision } from './parse.js'
import { buildMessages } from './prompt.js'

type Opts = { fetch?: typeof fetch; timeoutMs?: number }

export class ZeroGDecider implements Decider {
  private readonly doFetch: typeof fetch
  private readonly timeoutMs: number

  constructor(private readonly port: ZeroGPort, opts: Opts = {}) {
    this.doFetch = opts.fetch ?? fetch
    this.timeoutMs = opts.timeoutMs ?? 8000
  }

  async decide(ctx: CheckpointContext): Promise<DeciderResult> {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), this.timeoutMs)
    try {
      const headers = await this.port.headers()
      const res = await this.doFetch(`${this.port.endpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ model: this.port.model, messages: buildMessages(ctx), temperature: 0.2 }),
        signal: ac.signal,
      })
      if (!res.ok) return { decision: null, zeroG: null }
      const data = (await res.json()) as {
        id?: string
        choices?: { message?: { content?: string } }[]
        x_0g_trace?: { request_id?: string; provider?: `0x${string}` }
      }
      const raw = data.choices?.[0]?.message?.content ?? ''
      const requestId = data.x_0g_trace?.request_id ?? res.headers.get('ZG-Res-Key') ?? data.id ?? ''
      const provider = data.x_0g_trace?.provider ?? this.port.provider
      if (requestId === '' || raw === '') return { decision: null, zeroG: null }
      const verified = await this.port.verify(requestId, raw).catch(() => null)
      return {
        decision: parseDecision(raw),
        zeroG: { provider, model: this.port.model, requestId, verified, raw },
      }
    } catch {
      return { decision: null, zeroG: null }
    } finally {
      clearTimeout(timer)
    }
  }
}
