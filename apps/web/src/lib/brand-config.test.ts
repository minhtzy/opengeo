import { beforeEach, describe, expect, it } from 'vitest'
import { loadBrandConfig, normalizeWebsite, saveBrandConfig } from './brand-config'

beforeEach(() => localStorage.clear())

describe('brand configuration', () => {
  it('normalizes a hostname into an HTTPS URL', () => expect(normalizeWebsite('geosuite.ai')).toBe('https://geosuite.ai'))
  it('rejects non-HTTP URLs', () => expect(normalizeWebsite('ftp://geosuite.ai')).toBeNull())
  it('round-trips a complete configuration through storage', () => {
    const config = { brandName: 'GeoSuite', website: 'https://geosuite.ai', trackingMode: 'website' as const, prompts: [] }
    saveBrandConfig(config)
    expect(loadBrandConfig()).toEqual(config)
  })
})
