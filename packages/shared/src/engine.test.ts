import { describe, expect, it } from 'vitest'
import { engineResponseSchema } from './engine.js'
const valid = { engineId: 'openai', model: 'gpt-4o', text: 'Viettel là nhà mạng.', citations: [{ url: 'https://viettel.vn/', title: 'Viettel', position: 1 }], latencyMs: 1200, usage: { inputTokens: 40, outputTokens: 120, costUsd: 0.0021 } }
describe('engineResponseSchema', () => {
  it('accepts valid response', () => expect(engineResponseSchema.safeParse(valid).success).toBe(true))
  it('rejects invalid citation position', () => expect(engineResponseSchema.safeParse({ ...valid, citations: [{ url: 'https://a.com/', title: null, position: 0 }] }).success).toBe(false))
  it('rejects unknown engine', () => expect(engineResponseSchema.safeParse({ ...valid, engineId: 'bing' }).success).toBe(false))
})
