import fp from 'fastify-plugin'
import Redis from 'ioredis'
import { env } from '../config/env.js'
import { logger } from '../shared/logger.js'

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis
  }
}

export default fp(async (fastify) => {
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
  })

  redis.on('error', (err) => logger.error({ err }, 'Redis connection error'))
  redis.on('connect', () => logger.info('Redis connected'))

  await redis.connect()

  fastify.decorate('redis', redis)

  fastify.addHook('onClose', async () => {
    await redis.quit()
  })
}, { name: 'redis' })
