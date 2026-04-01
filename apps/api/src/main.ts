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

const LANDING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JewelAI — AI-Powered Jewelry Photography on WhatsApp</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .container { max-width: 640px; padding: 48px 24px; text-align: center; }
    .logo { font-size: 48px; margin-bottom: 8px; }
    h1 { font-size: 28px; color: #fff; margin-bottom: 8px; }
    .tagline { font-size: 16px; color: #999; margin-bottom: 36px; }
    .features { text-align: left; margin: 0 auto 36px; max-width: 400px; }
    .feature { padding: 12px 0; border-bottom: 1px solid #1a1a1a; display: flex; gap: 12px; align-items: start; }
    .feature:last-child { border-bottom: none; }
    .feature span.icon { font-size: 20px; flex-shrink: 0; }
    .feature .text strong { color: #fff; display: block; margin-bottom: 2px; }
    .feature .text { font-size: 14px; color: #aaa; line-height: 1.4; }
    .pricing { background: #111; border-radius: 12px; padding: 24px; margin-bottom: 36px; }
    .pricing h2 { font-size: 18px; color: #fff; margin-bottom: 16px; }
    .plans { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; text-align: left; }
    .plan { background: #1a1a1a; border-radius: 8px; padding: 14px; }
    .plan .name { font-size: 14px; font-weight: 600; color: #fff; }
    .plan .price { font-size: 13px; color: #ccc; }
    .plan .credits { font-size: 12px; color: #888; }
    .cta { display: inline-block; background: #25D366; color: #fff; font-weight: 600; font-size: 16px; padding: 14px 32px; border-radius: 8px; text-decoration: none; margin-bottom: 24px; }
    .cta:hover { background: #1fb855; }
    .footer { font-size: 12px; color: #555; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">💎</div>
    <h1>JewelAI</h1>
    <p class="tagline">AI-powered professional jewelry photography — right on WhatsApp</p>

    <div class="features">
      <div class="feature">
        <span class="icon">📸</span>
        <div class="text"><strong>Product Photos</strong>Send a jewelry photo, choose a style, get a professional product image in seconds.</div>
      </div>
      <div class="feature">
        <span class="icon">📸</span>
        <div class="text"><strong>Batch Processing</strong>Process up to 10 photos at once with the same template and style.</div>
      </div>
      <div class="feature">
        <span class="icon">🎉</span>
        <div class="text"><strong>Festive Posts</strong>Create branded festival greeting posts with your logo, name, and contact.</div>
      </div>
      <div class="feature">
        <span class="icon">💰</span>
        <div class="text"><strong>Live Rates</strong>Get real-time gold and silver prices instantly.</div>
      </div>
      <div class="feature">
        <span class="icon">📄</span>
        <div class="text"><strong>GST Invoices</strong>Generate professional tax invoices with CGST/SGST breakdown.</div>
      </div>
      <div class="feature">
        <span class="icon">📒</span>
        <div class="text"><strong>Udhaar Book</strong>Track customer credit, dues, and payment history.</div>
      </div>
    </div>

    <div class="pricing">
      <h2>Plans</h2>
      <div class="plans">
        <div class="plan"><div class="name">Free Demo</div><div class="price">₹0</div><div class="credits">25 credits</div></div>
        <div class="plan"><div class="name">Starter</div><div class="price">₹149/mo</div><div class="credits">50 credits/month</div></div>
        <div class="plan"><div class="name">Shop</div><div class="price">₹499/mo</div><div class="credits">200 credits/month</div></div>
        <div class="plan"><div class="name">Pro</div><div class="price">₹999/mo</div><div class="credits">500 credits/month</div></div>
        <div class="plan"><div class="name">Wholesale</div><div class="price">₹1,999/mo</div><div class="credits">1400 credits/month</div></div>
        <div class="plan"><div class="name">Credit Packs</div><div class="price">From ₹199</div><div class="credits">100–2500 credits</div></div>
      </div>
    </div>

    <p class="footer">Powered by JewelAI &bull; Payments secured by Razorpay</p>
  </div>
</body>
</html>`

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

  // Landing page for Razorpay verification & visitors
  fastify.get('/', async (_req, reply) => {
    reply.type('text/html').send(LANDING_HTML)
  })

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
