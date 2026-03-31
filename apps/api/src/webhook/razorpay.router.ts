import type { FastifyInstance } from 'fastify'
import crypto from 'crypto'
import { prisma } from '@jewel/database'
import { env } from '../config/env.js'
import { sendText } from '../whatsapp/wa.messages.js'
import { addCredits } from '../billing/credits.service.js'
import { getPlanCredits } from '../billing/app-config.service.js'
import { logger } from '../shared/logger.js'
import { CREDIT_PACKS } from '@jewel/shared-types'

const PLAN_LABEL: Record<string, string> = {
  STARTER: 'Starter',
  SHOP: 'Shop',
  PRO: 'Pro',
  WHOLESALE: 'Wholesale',
}

export async function razorpayRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/razorpay/webhook', async (request, reply) => {
    // Verify signature
    const rawBody = (request as typeof request & { rawBody: Buffer }).rawBody
    const signature = request.headers['x-razorpay-signature'] as string

    if (env.RAZORPAY_WEBHOOK_SECRET && signature) {
      const expected = crypto
        .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex')

      if (expected !== signature) {
        logger.warn('Razorpay webhook signature mismatch')
        return reply.status(400).send({ error: 'Invalid signature' })
      }
    }

    const payload = request.body as any
    const event = payload?.event

    logger.info({ event }, 'Razorpay webhook received')

    if (event === 'payment_link.paid') {
      const notes = payload?.payload?.payment_link?.entity?.notes
      const phone = notes?.phone as string | undefined
      const plan = notes?.plan as string | undefined

      if (!phone || !plan) {
        logger.warn({ notes }, 'Missing phone or plan in payment link notes')
        return reply.status(200).send({ ok: true })
      }

      const user = await prisma.user.findUnique({ where: { phone } })
      if (!user) {
        logger.warn({ phone }, 'User not found for payment webhook')
        return reply.status(200).send({ ok: true })
      }

      // Check if this is a credit pack purchase
      if (plan.startsWith('CREDIT_PACK_')) {
        const creditAmount = parseInt(plan.replace('CREDIT_PACK_', ''), 10)
        const pack = CREDIT_PACKS.find((p) => p.credits === creditAmount)

        if (!pack) {
          logger.warn({ plan, phone }, 'Unknown credit pack')
          return reply.status(200).send({ ok: true })
        }

        await addCredits(user.id, pack.credits)

        logger.info({ phone, credits: pack.credits }, 'Credit pack purchased')

        setImmediate(async () => {
          try {
            await sendText(
              phone,
              [
                `🎉 *Payment Successful!*`,
                ``,
                `✅ *${pack.credits} credits* have been added to your account.`,
                ``,
                `Type *menu* to get started!`,
              ].join('\n'),
            )
          } catch (err) {
            logger.error({ err, phone }, 'Failed to send credit pack confirmation WhatsApp')
          }
        })

        return reply.status(200).send({ ok: true })
      }

      // Subscription plan purchase
      const planKey = plan.toUpperCase() as 'STARTER' | 'SHOP' | 'PRO' | 'WHOLESALE'

      const periodEnd = new Date()
      periodEnd.setMonth(periodEnd.getMonth() + 1)

      await prisma.subscription.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          plan: planKey,
          status: 'ACTIVE',
          currentPeriodEnd: periodEnd,
        },
        update: {
          plan: planKey,
          status: 'ACTIVE',
          currentPeriodEnd: periodEnd,
        },
      })

      // Add monthly credits
      const monthlyCredits = await getPlanCredits(fastify.redis, planKey)
      await addCredits(user.id, monthlyCredits)

      // Send WhatsApp confirmation
      setImmediate(async () => {
        try {
          await sendText(
            phone,
            [
              `🎉 *Payment Successful!*`,
              ``,
              `Your *${PLAN_LABEL[planKey] ?? planKey} Plan* is now active.`,
              `✅ *${monthlyCredits} credits* have been added to your account.`,
              ``,
              `✅ Valid until: ${periodEnd.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`,
              ``,
              `Type *menu* to get started!`,
            ].join('\n'),
          )
        } catch (err) {
          logger.error({ err, phone }, 'Failed to send payment confirmation WhatsApp')
        }
      })
    }

    return reply.status(200).send({ ok: true })
  })
}
