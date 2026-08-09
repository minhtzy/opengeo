import type { Redis } from 'ioredis'

export interface RateLimit { capacity: number; refillPerSecond: number }
export interface Throttle { acquire(key: string): Promise<void> }
export interface ThrottleOptions { now?: () => number; sleep?: (ms: number) => Promise<void>; maxAttempts?: number }

const LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local state = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(state[1]); local ts = tonumber(state[2])
if tokens == nil or ts == nil then tokens = capacity; ts = now end
local elapsed = math.max(0, now - ts) / 1000
tokens = math.min(capacity, tokens + elapsed * refill)
local wait = 0
if tokens >= 1 then tokens = tokens - 1 else wait = math.ceil((1 - tokens) / refill * 1000) end
redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', key, 300000)
return wait
`
const sleepDefault = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function createRedisThrottle(redis: Redis, limits: Record<string, RateLimit>, options: ThrottleOptions = {}): Throttle {
  const now = options.now ?? (() => Date.now()); const sleep = options.sleep ?? sleepDefault
  const maxAttempts = options.maxAttempts ?? 20
  return { async acquire(key) {
    const limit = limits[key]
    if (!limit) throw new Error(`Khoá giới hạn "${key}" chưa cấu hình`)
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const wait = Number(await redis.eval(LUA, 1, `throttle:${key}`, String(limit.capacity), String(limit.refillPerSecond), String(now())))
      if (wait === 0) return
      await sleep(wait)
    }
    throw new Error(`Không lấy được token cho "${key}" sau ${maxAttempts} lần thử`)
  } }
}
