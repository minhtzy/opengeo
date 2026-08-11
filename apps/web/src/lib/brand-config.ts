export type TrackingMode = 'website' | 'prompts'

export type BrandConfig = {
  brandName: string
  website: string
  trackingMode: TrackingMode
  prompts: string[]
}

const STORAGE_KEY = 'geosuite:brand-config'

export function normalizeWebsite(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString().replace(/\/$/, '') : null
  } catch { return null }
}

export function saveBrandConfig(config: BrandConfig): boolean {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); return true } catch { return false }
}

export function loadBrandConfig(): BrandConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as BrandConfig
    if (!parsed.brandName || !parsed.website || !Array.isArray(parsed.prompts)) return null
    return parsed
  } catch { return null }
}

export function clearBrandConfig(): void { localStorage.removeItem(STORAGE_KEY) }
