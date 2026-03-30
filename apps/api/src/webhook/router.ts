import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { env } from '../config/env.js'
import { verifyMetaSignature } from './verifier.js'
import { routeWebhookPayload } from './message-router.js'
import type { MetaWebhookPayload } from '../whatsapp/wa.types.js'
import { logger } from '../shared/logger.js'

export async function webhookRoutes(fastify: FastifyInstance) {
  /**
   * GET /webhook
   * Meta's one-time webhook verification challenge
   */
  fastify.get('/webhook', async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as Record<string, string>
    const mode = query['hub.mode']
    const token = query['hub.verify_token']
    const challenge = query['hub.challenge']

    if (mode === 'subscribe' && token === env.META_VERIFY_TOKEN) {
      logger.info('WhatsApp webhook verified')
      return reply.status(200).send(challenge)
    }

    return reply.status(403).send({ error: 'Forbidden' })
  })

  /**
   * POST /webhook
   * Incoming WhatsApp messages. Must respond with 200 within 5 seconds.
   */
  fastify.post(
    '/webhook',
    {
      config: { rawBody: true }, // needed for HMAC signature verification
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const signature = req.headers['x-hub-signature-256'] as string | undefined
      const rawBody = (req as FastifyRequest & { rawBody?: Buffer }).rawBody

      if (!rawBody || !verifyMetaSignature(rawBody, signature)) {
        logger.warn({ signature }, 'Invalid webhook signature')
        return reply.status(401).send({ error: 'Unauthorized' })
      }

      // Acknowledge immediately — process asynchronously
      reply.status(200).send({ status: 'ok' })

      const payload = req.body as MetaWebhookPayload
      setImmediate(() => {
        routeWebhookPayload(payload, fastify).catch((err) =>
          logger.error({ err }, 'routeWebhookPayload unhandled error'),
        )
      })
    },
  )
}
