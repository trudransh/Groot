import type { ZeroGPort } from './types.js'

export function routerPort(apiKey: string, baseUrl = 'https://router-api.0g.ai/v1', model = 'qwen3-omni-flash'): ZeroGPort {
  return {
    provider: '0x0000000000000000000000000000000000000000',
    model,
    endpoint: baseUrl,
    headers: async () => ({ Authorization: `Bearer ${apiKey}` }),
    verify: async () => null,
  }
}
