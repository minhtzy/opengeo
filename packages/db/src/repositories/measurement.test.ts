import { describe, expect, it } from 'vitest'
import { hostnameOf, isOwnDomain } from './measurement.js'

describe('measurement helpers', () => {
  it('normalizes URL hostnames', () => {
    expect(hostnameOf('https://www.Viettel.vn/path')).toBe('viettel.vn')
  })
  it('recognizes exact and subdomain own domains only', () => {
    expect(isOwnDomain('https://shop.viettel.vn', ['viettel.vn'])).toBe(true)
    expect(isOwnDomain('https://viettel.vn.evil.test', ['viettel.vn'])).toBe(false)
  })
})
