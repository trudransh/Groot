import type { Decision } from '../types.js'

function firstJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return text.slice(start, i + 1)
  }
  return null
}

export function parseDecision(text: string): Decision | null {
  const raw = firstJsonObject(text)
  if (raw === null) return null
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof obj !== 'object' || obj === null) return null
  if (typeof obj.amountWei === 'number' || typeof obj.amountWei === 'bigint') obj.amountWei = BigInt(obj.amountWei).toString()
  return obj as unknown as Decision
}
