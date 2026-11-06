import { describe, expect, it } from 'vitest'
import { parseDecision } from '../src/decider/parse.js'

const json = '{"action":"water","waterMl":120,"reason":"soil dry","confidence":0.82}'

describe('parseDecision', () => {
  it('parses plain JSON', () => {
    expect(parseDecision(json)).toEqual({ action: 'water', waterMl: 120, reason: 'soil dry', confidence: 0.82 })
  })

  it('parses JSON inside a markdown code fence', () => {
    expect(parseDecision('```json\n' + json + '\n```')?.action).toBe('water')
  })

  it('parses JSON surrounded by prose', () => {
    expect(parseDecision('I think: ' + json + ' hope that helps')?.waterMl).toBe(120)
  })

  it('keeps a numeric amountWei as a decimal string', () => {
    expect(parseDecision('{"action":"ask_help","amountWei":1000,"reason":"x","confidence":0.9}')?.amountWei).toBe('1000')
  })

  it('returns null for text with no JSON', () => {
    expect(parseDecision('water the plant please')).toBeNull()
  })

  it('returns null for broken JSON', () => {
    expect(parseDecision('{"action":"water",')).toBeNull()
  })
})
