import type { Redis } from 'ioredis'
import {
  contaAzulAcquireMaxWaitMs,
  contaAzulRpm,
  contaAzulRps,
} from './config.js'
import { ContaAzulRateLimitError } from './errors.js'

const ACQUIRE_LUA = `
local secKey = KEYS[1]
local minKey = KEYS[2]
local nowMs = tonumber(ARGV[1])
local rps = tonumber(ARGV[2])
local rpm = tonumber(ARGV[3])
local secWindow = 1000
local minWindow = 60000

local secTokens = tonumber(redis.call('GET', secKey) or '0')
local secAt = tonumber(redis.call('GET', secKey .. ':at') or tostring(nowMs))
if nowMs - secAt >= secWindow then
  secTokens = 0
  secAt = nowMs
end

local minTokens = tonumber(redis.call('GET', minKey) or '0')
local minAt = tonumber(redis.call('GET', minKey .. ':at') or tostring(nowMs))
if nowMs - minAt >= minWindow then
  minTokens = 0
  minAt = nowMs
end

if secTokens >= rps or minTokens >= rpm then
  -- Only wait for the window(s) whose limit is actually exceeded. Taking the
  -- max of both windows unconditionally would make a per-second burst wait out
  -- the full minute window (~60s) even when the minute budget is untouched.
  local waitMs = 1
  if secTokens >= rps then
    waitMs = math.max(waitMs, secWindow - (nowMs - secAt))
  end
  if minTokens >= rpm then
    waitMs = math.max(waitMs, minWindow - (nowMs - minAt))
  end
  return waitMs
end

secTokens = secTokens + 1
minTokens = minTokens + 1
redis.call('SET', secKey, secTokens, 'PX', secWindow + 100)
redis.call('SET', secKey .. ':at', secAt, 'PX', secWindow + 100)
redis.call('SET', minKey, minTokens, 'PX', minWindow + 100)
redis.call('SET', minKey .. ':at', minAt, 'PX', minWindow + 100)
return 0
`

export interface RateLimiter {
  acquire(tenantId: string, storeId: string): Promise<void>
}

export function createRateLimiter(redis: Redis): RateLimiter {
  const rps = contaAzulRps()
  const rpm = contaAzulRpm()
  const maxWaitMs = contaAzulAcquireMaxWaitMs()

  return {
    async acquire(tenantId: string, storeId: string): Promise<void> {
      const accountKey = `${tenantId}:${storeId}`
      const secKey = `conta_azul:ratelimit:${accountKey}:sec`
      const minKey = `conta_azul:ratelimit:${accountKey}:min`
      const deadline = Date.now() + maxWaitMs

      while (true) {
        const nowMs = Date.now()
        const waitMs = (await redis.eval(
          ACQUIRE_LUA,
          2,
          secKey,
          minKey,
          String(nowMs),
          String(rps),
          String(rpm)
        )) as number

        if (waitMs === 0) {
          return
        }

        if (Date.now() + waitMs > deadline) {
          throw new ContaAzulRateLimitError(waitMs)
        }

        await sleep(waitMs)
      }
    },
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
