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
    plan_price_starter: '99',
    plan_price_shop: '499',
    plan_price_pro: '999',
    plan_price_wholesale: '1999',
  }
  const value = await getConfigValue(redis, key, fallbacks[key] ?? '999')
  return parseInt(value, 10)
}

export async function getPlanCredits(redis: Redis, plan: string): Promise<number> {
  const key = `plan_credits_${plan.toLowerCase()}`
  const fallbacks: Record<string, string> = {
    plan_credits_free: '25',
    plan_credits_starter: '80',
    plan_credits_shop: '200',
    plan_credits_pro: '500',
    plan_credits_wholesale: '1400',
  }
  const value = await getConfigValue(redis, key, fallbacks[key] ?? '5')
  return parseInt(value, 10)
}
