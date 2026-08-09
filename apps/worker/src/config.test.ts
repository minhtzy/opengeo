import { expect, it } from 'vitest'
import { loadConfig } from './config.js'

const base = { DATABASE_URL: 'postgres://localhost/geosuite', REDIS_URL: 'redis://localhost', OPENAI_API_KEY: 'a', PERPLEXITY_API_KEY: 'b', GEMINI_API_KEY: 'c', SERPAPI_API_KEY: 'd' }
it('điền model mặc định', () => { const c = loadConfig(base); expect(c.openai.model).toBe('gpt-4o'); expect(c.perplexity.model).toBe('sonar-pro'); expect(c.gemini.model).toBe('gemini-2.5-flash'); expect(c.extraction.model).toBe('gpt-4o-mini') })
it('cho phép ghi đè model', () => { const c = loadConfig({ ...base, OPENAI_MODEL: 'x', EXTRACTION_MODEL: 'y' }); expect(c.openai.model).toBe('x'); expect(c.extraction.model).toBe('y') })
it('báo biến bắt buộc', () => { expect(() => loadConfig({ ...base, OPENAI_API_KEY: undefined })).toThrow(/OPENAI_API_KEY/) })
