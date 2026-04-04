import type { FastifyInstance } from 'fastify'
import type { MetaInteractiveMessage } from '../whatsapp/wa.types.js'
import { sendText } from '../whatsapp/wa.messages.js'
import { getSession, transitionState, resetSession } from '../session/session.service.js'
import { findOrCreateUser } from '../users/user.service.js'
import { enqueueImageGenJob } from '../features/image-generation/image-gen.queue.js'
import { prisma } from '@jewel/database'
import { logger } from '../shared/logger.js'
import { getCompatibleTemplates } from '../features/image-generation/templates.service.js'
import { sendTemplateGallery } from './awaiting-template.handler.js'

export async function handleAwaitingConfirmation(
  message: MetaInteractiveMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  const interactive = message.interactive
  if (interactive.type !== 'button_reply') return

  const buttonId = interactive.button_reply.id

  if (buttonId === 'choose_different') {
    // Go back to template selection
    const session = await getSession(fastify.redis, phone)
    const data = session?.data ?? {}
    await transitionState(fastify.redis, phone, 'AWAITING_TEMPLATE')

    const user = await findOrCreateUser(phone)
    const subscription = await fastify.prisma.subscription.findUnique({ where: { userId: user.id } })
    const templates = await getCompatibleTemplates(data.jewellType ?? 'other', subscription?.plan ?? 'FREE')

    if (templates.length) {
      await sendTemplateGallery(phone, data.jewellType ?? 'jewelry', templates)
    }
    return
  }

  if (buttonId === 'cancel') {
    await resetSession(fastify.redis, phone)
    await sendText(phone, "Cancelled. Send me a photo anytime to start again! 😊")
    return
  }

  // buttonId starts with "confirm_generate:"
  if (!buttonId.startsWith('confirm_generate:')) return

  const session = await getSession(fastify.redis, phone)
  const data = session?.data ?? {}

  if (!data.sourceImageUrl || !data.selectedTemplateId || !data.jewellType || !data.jewellDescription || !data.aspectRatio) {
    await sendText(phone, "Something went wrong. Please start over by sending your photo again.")
    await resetSession(fastify.redis, phone)
    return
  }

  const user = await findOrCreateUser(phone)

  // Create DB job record
  const dbJob = await prisma.imageJob.create({
    data: {
      userId: user.id,
      status: 'QUEUED',
      sourceImageUrl: data.sourceImageUrl,
      templateId: data.selectedTemplateId,
      jewellType: data.jewellType,
      jewellDesc: data.jewellDescription,
    },
  })

  // Transition to PROCESSING before enqueuing
  await transitionState(fastify.redis, phone, 'PROCESSING', {
    pendingJobId: dbJob.id,
  })

  // Enqueue the BullMQ job
  try {
    await enqueueImageGenJob({
      jobId: dbJob.id,
      userId: user.id,
      userPhone: phone,
      sourceImageUrl: data.sourceImageUrl,
      templateId: data.selectedTemplateId,
      jewellType: data.jewellType,
      jewellDescription: data.jewellDescription,
      aspectRatio: data.aspectRatio as '1:1' | '9:16',
    })

    logger.info({ jobId: dbJob.id, userId: user.id }, 'Image gen job enqueued')
  } catch (err) {
    logger.error({ err, jobId: dbJob.id }, 'Failed to enqueue image gen job')
    await sendText(phone, "Failed to start generation. Please try again.")
    await transitionState(fastify.redis, phone, 'IDLE')
    return
  }

  await sendText(
    phone,
    "⏳ *Generating your photo!*\n\nThis usually takes 20–40 seconds. I'll send your result as soon as it's ready!",
  )
}
