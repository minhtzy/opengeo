import { expect, it } from 'vitest'
import { createRedisThrottle } from './throttle.js'

it('rejects keys without a configured limit', async () => {
  const throttle = createRedisThrottle({ eval: async () => 0 } as never, {})
  await expect(throttle.acquire('unknown')).rejects.toThrow(/chưa cấu hình/i)
})
it('sleeps and retries while Redis reports an empty bucket', async () => {
  const waits: number[] = []; let calls = 0
  const throttle = createRedisThrottle({ eval: async () => ++calls === 1 ? 20 : 0 } as never, { openai: { capacity: 1, refillPerSecond: 1 } }, { sleep: async (ms) => void waits.push(ms) })
  await throttle.acquire('openai'); expect(waits).toEqual([20])
})
