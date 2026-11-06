import { describe, expect, it } from 'vitest'
import { fallbackLine } from '../src/voice/templates.js'
import { PERSONAS } from '../src/personas.js'

describe('fallbackLine', () => {
  it('has a line for every persona and every talk kind', () => {
    for (const p of PERSONAS) {
      for (const kind of ['ask', 'give', 'thanks', 'water', 'refuse'] as const) {
        const line = fallbackLine(p.label, kind, { other: 'neem-02', ml: 120, amount: '0.01' })
        expect(line.length).toBeGreaterThan(0)
        expect(line).not.toContain('{')
      }
    }
  })

  it('fills in the other plant, millilitres and amount', () => {
    expect(fallbackLine('banyan-01', 'give', { other: 'tulsi-04', amount: '0.01' })).toContain('tulsi-04')
    expect(fallbackLine('mint-05', 'water', { ml: 80 })).toContain('80')
  })

  it('falls back to a generic voice for an unknown plant', () => {
    expect(fallbackLine('unknown-99', 'ask', { amount: '0.002' })).toContain('0.002')
  })

  it('is the same line every time for the same input', () => {
    expect(fallbackLine('neem-02', 'thanks', { other: 'banyan-01' })).toBe(fallbackLine('neem-02', 'thanks', { other: 'banyan-01' }))
  })
})
