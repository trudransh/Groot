import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { Pump } from './deliver.js'

type Opts = { serverPath: string; pumpUrl: string; token: string }

export class McpPump implements Pump {
  private constructor(private readonly client: Client) {}

  static async connect(o: Opts): Promise<McpPump> {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [o.serverPath],
      env: { PUMP_URL: o.pumpUrl, PUMP_TOKEN: o.token, PATH: process.env.PATH ?? '' },
    })
    const client = new Client({ name: 'plant-agent', version: '1.0.0' })
    await client.connect(transport)
    return new McpPump(client)
  }

  private async call(name: string, args: Record<string, unknown> = {}): Promise<void> {
    const r = (await this.client.callTool({ name, arguments: args })) as { isError?: boolean; content?: { text?: string }[] }
    if (r.isError) throw new Error(r.content?.[0]?.text ?? `${name} failed`)
  }

  run(seconds: number) {
    return this.call('pump_run', { seconds })
  }

  stop() {
    return this.call('pump_stop')
  }

  close() {
    return this.client.close()
  }
}
