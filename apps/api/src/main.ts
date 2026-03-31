import Fastify from 'fastify'
import { env } from './config/env.js'
import { logger } from './shared/logger.js'

// Plugins
import redisPlugin from './plugins/redis.js'
import prismaPlugin from './plugins/prisma.js'
import cloudinaryPlugin from './plugins/cloudinary.js'

// Routes
import { webhookRoutes } from './webhook/router.js'
import { razorpayRoutes } from './webhook/razorpay.router.js'

// Workers
import { startImageGenWorker } from './features/image-generation/image-gen.worker.js'
import { startFestivePostWorker } from './features/festive-post/festive-post.worker.js'

async function bootstrap() {
  const fastify = Fastify({
    logger: false, // Using our own pino instance
    trustProxy: true,
  })

  // ── Raw body for Meta HMAC verification ─────────────────────────────────
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body, done) => {
      ;(req as typeof req & { rawBody: Buffer }).rawBody = body as Buffer
      try {
        done(null, JSON.parse(body.toString()))
      } catch (err) {
        done(err as Error, undefined)
      }
    },
  )

  // ── Register plugins ─────────────────────────────────────────────────────
  await fastify.register(redisPlugin)
  await fastify.register(prismaPlugin)
  await fastify.register(cloudinaryPlugin)

  // ── Register routes ──────────────────────────────────────────────────────
  await fastify.register(webhookRoutes)
  await fastify.register(razorpayRoutes)

  // Health check
  fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // ── Start BullMQ workers ─────────────────────────────────────────────────
  const worker = startImageGenWorker()
  const festiveWorker = startFestivePostWorker()

  // ── Start server ─────────────────────────────────────────────────────────
  try {
    await fastify.listen({ port: env.PORT, host: '0.0.0.0' })
    logger.info(`JewelAI API listening on port ${env.PORT}`)
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server')
    await worker.close()
    await festiveWorker.close()
    process.exit(1)
  }

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = async () => {
    logger.info('Shutting down...')
    await worker.close()
    await festiveWorker.close()
    await fastify.close()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

bootstrap()
