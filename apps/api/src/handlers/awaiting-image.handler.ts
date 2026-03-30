import type { FastifyInstance } from 'fastify'
import type { MetaImageMessage } from '../whatsapp/wa.types.js'
import { sendText } from '../whatsapp/wa.messages.js'
import { transitionState } from '../session/session.service.js'
import { downloadMediaBuffer } from '../whatsapp/wa.media.js'
import { uploadBuffer } from '../storage/cloudinary.service.js'
import { findOrCreateUser } from '../users/user.service.js'
import { hasCredits } from '../billing/credits.service.js'
import { analyzeJewelryImage } from '../features/image-generation/jewelry-analyzer.js'
import { getCompatibleTemplates } from '../features/image-generation/templates.service.js'
import { sendTemplateGallery } from './awaiting-template.handler.js'
import { logger } from '../shared/logger.js'
import { ImageAnalysisError } from '../shared/errors.js'

export async function handleAwaitingImage(
  message: MetaImageMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  const user = await findOrCreateUser(phone)

  // Credit gate
  if (!(await hasCredits(user.id))) {
    await sendText(
      phone,
      "You're out of credits 😔\n\nUpgrade to continue generating professional product photos.\n\nReply *UPGRADE* to see our plans.",
    )
    await transitionState(fastify.redis, phone, 'IDLE')
    return
  }

  // Transition immediately so re-sends don't re-trigger
  await transitionState(fastify.redis, phone, 'ANALYZING', {
    sourceMediaId: message.image.id,
  })

  await sendText(phone, '🔍 Analyzing your jewelry... This takes just a moment!')

  let sourceImageUrl: string
  try {
    // Download from Meta CDN
    const buffer = await downloadMediaBuffer(message.image.id)

    // Upload to Cloudinary for permanent URL
    sourceImageUrl = await uploadBuffer(buffer, `jewel/source/${user.id}`)
  } catch (err) {
    logger.error({ err, phone }, 'Failed to download/upload source image')
    await sendText(phone, "Couldn't process your image. Please send it again.")
    await transitionState(fastify.redis, phone, 'AWAITING_IMAGE')
    return
  }

  // Analyze with GPT-4o Vision
  let jewellType: string
  let jewellDescription: string

  try {
    const analysis = await analyzeJewelryImage(sourceImageUrl)
    jewellType = analysis.jewel_type
    jewellDescription = analysis.description
  } catch (err) {
    logger.error({ err, phone }, 'Jewelry analysis failed')

    const userMsg =
      err instanceof ImageAnalysisError
        ? "I couldn't identify the jewelry in that photo. Please try a clearer image with the piece in focus."
        : 'Analysis failed. Please try again.'

    await sendText(phone, userMsg)
    await transitionState(fastify.redis, phone, 'AWAITING_IMAGE')
    return
  }

  // Update session with analysis results
  await transitionState(fastify.redis, phone, 'AWAITING_TEMPLATE', {
    sourceImageUrl,
    jewellType,
    jewellDescription,
  })

  // Get compatible templates
  const subscription = await fastify.prisma.subscription.findUnique({ where: { userId: user.id } })
  const templates = await getCompatibleTemplates(jewellType, subscription?.plan ?? 'FREE')

  if (!templates.length) {
    await sendText(phone, "No templates available for your plan. Please contact support.")
    await transitionState(fastify.redis, phone, 'IDLE')
    return
  }

  await sendTemplateGallery(phone, jewellType, jewellDescription, templates)
}
