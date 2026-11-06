import { describe, expect, it } from 'vitest'
import { statusFor } from '../src/status.js'
import type { Decision } from '../src/types.js'

const d = (action: Decision['action']): Decision => ({ action, reason: 'r', confidence: 0.9 })

describe('statusFor', () => {
  it.each([
    ['water', [], 'thirsty'],
    ['ask_help', [], 'thirsty'],
    ['give', [], 'giving'],
    ['wait', [], 'ok'],
    ['wait', ['zero_g_timeout'], 'safe_stop'],
  ] as const)('%s with %j gives %s', (action, rules, expected) => {
    expect(statusFor(d(action), [...rules])).toBe(expected)
  })
})
