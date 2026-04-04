import type { FastifyInstance } from 'fastify'
import type { MetaImageMessage } from '../whatsapp/wa.types.js'
import { sendText } from '../whatsapp/wa.messages.js'
import { getSession, transitionState } from '../session/session.service.js'
import { downloadMediaBuffer } from '../whatsapp/wa.media.js'
import { uploadBuffer } from '../storage/cloudinary.service.js'
import { findOrCreateUser } from '../users/user.service.js'
import { hasCredits } from '../billing/credits.service.js'
import { CREDIT_COST_PHOTO } from '../config/constants.js'
import { getCompatibleTemplates } from '../features/image-generation/templates.service.js'
import { sendTemplateGallery } from './awaiting-template.handler.js'
import { logger } from '../shared/logger.js'

export async function handleAwaitingImage(
  message: MetaImageMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  const user = await findOrCreateUser(phone)

  // Credit gate — need 5 credits per photo
  if (!(await hasCredits(user.id, CREDIT_COST_PHOTO))) {
    await sendText(
      phone,
      `You need at least *${CREDIT_COST_PHOTO} credits* to generate a photo but you don't have enough 😔\n\nType *menu* and tap *⬆️ Plans & Credits* to get more.`,
    )
    await transitionState(fastify.redis, phone, 'IDLE')
    return
  }

  // Get the jewel type that was selected in the previous step
  const session = await getSession(fastify.redis, phone)
  const jewellType = session?.data?.jewellType ?? 'other'

  await sendText(phone, '⏳ Uploading your photo...')

  let sourceImageUrl: string
  try {
    // Download from Meta CDN
    const buffer = await downloadMediaBuffer(message.image.id)

    // Upload to Cloudinary for permanent URL
    sourceImageUrl = await uploadBuffer(buffer, `jewel/source/${user.id}`)
  } catch (err) {
    logger.error({ err, phone }, 'Failed to download/upload source image')
    await sendText(phone, "Couldn't process your image. Please send it again.")
    return
  }

  // Update session with image URL and go straight to template selection
  await transitionState(fastify.redis, phone, 'AWAITING_TEMPLATE', {
    sourceImageUrl,
    jewellType,
    jewellDescription: jewellType, // no GPT-4o analysis — use the type as description
  })

  // Get compatible templates
  const subscription = await fastify.prisma.subscription.findUnique({ where: { userId: user.id } })
  const templates = await getCompatibleTemplates(jewellType, subscription?.plan ?? 'FREE')

  if (!templates.length) {
    await sendText(phone, 'No templates available for your plan. Please contact support.')
    await transitionState(fastify.redis, phone, 'IDLE')
    return
  }

  await sendTemplateGallery(phone, jewellType, templates)
}
