import { prisma } from '@jewel/database'
import type { Redis } from 'ioredis'

const CACHE_TTL = 300 // 5 minutes

async function getConfigValue(redis: Redis, key: string, fallback: string): Promise<string> {
  const cacheKey = `config:${key}`
  const cached = await redis.get(cacheKey)
  if (cached !== null) return cached

  const row = await prisma.appConfig.findUnique({ where: { key } })
  const value = row?.value ?? fallback
  await redis.setex(cacheKey, CACHE_TTL, value)
  return value
}

export async function getPlanPrice(redis: Redis, plan: string): Promise<number> {
  const key = `plan_price_${plan.toLowerCase()}`
  const fallbacks: Record<string, string> = {
    plan_price_starter: '299',
    plan_price_shop: '899',
    plan_price_pro: '1799',
    plan_price_wholesale: '4299',
  }
  const value = await getConfigValue(redis, key, fallbacks[key] ?? '999')
  return parseInt(value, 10)
}

export async function getPlanCredits(redis: Redis, plan: string): Promise<number> {
  const key = `plan_credits_${plan.toLowerCase()}`
  const fallbacks: Record<string, string> = {
    plan_credits_free: '5',
    plan_credits_starter: '15',
    plan_credits_shop: '75',
    plan_credits_pro: '200',
    plan_credits_wholesale: '700',
  }
  const value = await getConfigValue(redis, key, fallbacks[key] ?? '5')
  return parseInt(value, 10)
}
