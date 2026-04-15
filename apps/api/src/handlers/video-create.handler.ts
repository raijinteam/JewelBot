import type { FastifyInstance } from 'fastify'
import type { MetaMessage, MetaTextMessage, MetaImageMessage, MetaInteractiveMessage } from '../whatsapp/wa.types.js'
import { sendText, sendButtons, sendImage, sendList } from '../whatsapp/wa.messages.js'
import { setSession, getSession, transitionState, resetSession } from '../session/session.service.js'
import { findOrCreateUser } from '../users/user.service.js'
import { hasCredits } from '../billing/credits.service.js'
import { downloadMediaBuffer } from '../whatsapp/wa.media.js'
import { uploadBuffer } from '../storage/cloudinary.service.js'
import { VIDEO_TEMPLATES, getVideoTemplate, getVideoSubTemplate } from '../features/video-generation/video-templates.js'
import { enqueueVideoGenJob } from '../features/video-generation/video-gen.queue.js'
import { prisma } from '@jewel/database'
import { CREDIT_COST_VIDEO } from '../config/constants.js'
import { logger } from '../shared/logger.js'
import { randomUUID } from 'node:crypto'

// ─── Entry point: start video creation flow ─────────────────────────────────

export async function startVideoCreate(
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  const user = await findOrCreateUser(phone)

  if (!(await hasCredits(user.id, CREDIT_COST_VIDEO))) {
    await sendText(
      phone,
      `You need at least *${CREDIT_COST_VIDEO} credits* to generate a video but you don't have enough 😔\n\nType *menu* and tap *⬆️ Plans & Credits* to get more.`,
    )
    return
  }

  await setSession(fastify.redis, phone, 'VIDEO_UPLOAD', {})
  await sendText(phone, `🎬 *Create Video*\n\nSend me a clear photo of your *jewelry item*.\n\n💳 Cost: *${CREDIT_COST_VIDEO} credits* per video.`)
}

// ─── Step 1: Receive jewelry image ──────────────────────────────────────────

export async function handleVideoUpload(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'image') {
    await sendText(phone, '📸 Please send a *photo* of your jewelry item.')
    return
  }

  const img = message as MetaImageMessage
  const user = await findOrCreateUser(phone)

  await sendText(phone, '⏳ Uploading your photo...')

  try {
    const buffer = await downloadMediaBuffer(img.image.id)
    const sourceImageUrl = await uploadBuffer(buffer, `jewel/source/${user.id}`)

    await transitionState(fastify.redis, phone, 'VIDEO_TEMPLATE', {
      videoSourceImageUrl: sourceImageUrl,
    })

    // Show video template list
    await sendVideoTemplateList(phone)
  } catch (err) {
    logger.error({ err, phone }, 'Failed to upload video source image')
    await sendText(phone, "Couldn't process your image. Please send it again.")
  }
}

// ─── Step 2: Template selection ─────────────────────────────────────────────

async function sendVideoTemplateList(phone: string): Promise<void> {
  if (VIDEO_TEMPLATES.length === 0) {
    await sendText(phone, 'No video templates available. Please try again later.')
    return
  }

  // If only one template, auto-select it and go to sub-templates
  if (VIDEO_TEMPLATES.length === 1) {
    const template = VIDEO_TEMPLATES[0]
    if (template.subTemplates.length === 1) {
      // Only one sub-template too — skip both selections
      await sendText(phone, `🎬 *${template.name}* > *${template.subTemplates[0].name}*`)
    }
  }

  await sendList(
    phone,
    '🎬 *Choose a Video Style*\n\nSelect a template for your video:',
    '🎥 Select Style',
    [
      {
        title: 'Video Templates',
        rows: VIDEO_TEMPLATES.map((t) => ({
          id: `vtpl_${t.id}`,
          title: t.name,
          description: t.category,
        })),
      },
    ],
    '🎬 Video Templates',
  )
}

export async function handleVideoTemplate(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'interactive') {
    await sendVideoTemplateList(phone)
    return
  }

  const interactive = (message as MetaInteractiveMessage).interactive
  const replyId =
    interactive?.type === 'list_reply'
      ? interactive.list_reply.id
      : interactive?.type === 'button_reply'
        ? interactive.button_reply.id
        : ''

  // Strip the vtpl_ prefix we added for uniqueness
  const templateId = replyId.replace(/^vtpl_/, '')
  const template = getVideoTemplate(templateId)

  if (!template) {
    await sendVideoTemplateList(phone)
    return
  }

  await transitionState(fastify.redis, phone, 'VIDEO_SUB_TEMPLATE', {
    videoTemplateId: templateId,
  })

  // If only one sub-template, auto-select it
  if (template.subTemplates.length === 1) {
    const sub = template.subTemplates[0]
    await transitionState(fastify.redis, phone, 'VIDEO_ASPECT_RATIO', {
      videoTemplateId: templateId,
      videoSubTemplateId: sub.id,
    })

    // Show preview if available
    if (sub.previewUrl && !sub.previewUrl.includes('placehold.co')) {
      await sendImage(phone, sub.previewUrl, `🎬 *${template.name}* > *${sub.name}*`)
    } else {
      await sendText(phone, `🎬 *${template.name}* > *${sub.name}*`)
    }

    await sendAspectRatioButtons(phone)
    return
  }

  // Multiple sub-templates — show selection
  await sendSubTemplateList(phone, template.id, template.name, template.subTemplates)
}

// ─── Step 3: Sub-template selection ─────────────────────────────────────────

async function sendSubTemplateList(
  phone: string,
  templateId: string,
  templateName: string,
  subTemplates: { id: string; name: string }[],
): Promise<void> {
  await sendList(
    phone,
    `🎬 *${templateName}*\n\nChoose a variation:`,
    '✨ Select Variation',
    [
      {
        title: templateName,
        rows: subTemplates.map((s) => ({
          id: `vsub_${templateId}_${s.id}`,
          title: s.name,
        })),
      },
    ],
  )
}

export async function handleVideoSubTemplate(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  const session = await getSession(fastify.redis, phone)
  const templateId = session?.data?.videoTemplateId
  const template = templateId ? getVideoTemplate(templateId) : undefined

  if (!template || !templateId) {
    await sendText(phone, 'Something went wrong. Please start over.')
    await resetSession(fastify.redis, phone)
    return
  }

  if (message.type !== 'interactive') {
    await sendSubTemplateList(phone, template.id, template.name, template.subTemplates)
    return
  }

  const interactive = (message as MetaInteractiveMessage).interactive
  const replyId =
    interactive?.type === 'list_reply'
      ? interactive.list_reply.id
      : interactive?.type === 'button_reply'
        ? interactive.button_reply.id
        : ''

  // Extract sub-template ID: vsub_{templateId}_{subId} → subId
  const subTemplateId = replyId.replace(`vsub_${templateId}_`, '')
  const sub = getVideoSubTemplate(templateId, subTemplateId)

  if (!sub) {
    await sendSubTemplateList(phone, template.id, template.name, template.subTemplates)
    return
  }

  await transitionState(fastify.redis, phone, 'VIDEO_ASPECT_RATIO', {
    videoSubTemplateId: sub.id,
  })

  // Show preview
  if (sub.previewUrl && !sub.previewUrl.includes('placehold.co')) {
    await sendImage(phone, sub.previewUrl, `🎬 *${template.name}* > *${sub.name}*`)
  } else {
    await sendText(phone, `🎬 *${template.name}* > *${sub.name}*`)
  }

  await sendAspectRatioButtons(phone)
}

// ─── Step 4: Aspect ratio selection ─────────────────────────────────────────

async function sendAspectRatioButtons(phone: string): Promise<void> {
  await sendButtons(
    phone,
    '📐 *Choose aspect ratio:*',
    [
      { type: 'reply', reply: { id: 'video_ar_16_9', title: '🖥️ 16:9 Landscape' } },
      { type: 'reply', reply: { id: 'video_ar_9_16', title: '📱 9:16 Portrait' } },
    ],
  )
}

export async function handleVideoAspectRatio(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'interactive') {
    await sendAspectRatioButtons(phone)
    return
  }

  const interactive = (message as MetaInteractiveMessage).interactive
  const replyId =
    interactive?.type === 'button_reply'
      ? interactive.button_reply.id
      : ''

  const arMap: Record<string, '16:9' | '9:16'> = {
    video_ar_16_9: '16:9',
    video_ar_9_16: '9:16',
  }

  const aspectRatio = arMap[replyId]
  if (!aspectRatio) {
    await sendAspectRatioButtons(phone)
    return
  }

  const session = await getSession(fastify.redis, phone)
  const templateId = session?.data?.videoTemplateId
  const subTemplateId = session?.data?.videoSubTemplateId
  const template = templateId ? getVideoTemplate(templateId) : undefined
  const sub = templateId && subTemplateId ? getVideoSubTemplate(templateId, subTemplateId) : undefined

  await transitionState(fastify.redis, phone, 'VIDEO_CONFIRM', {
    videoAspectRatio: aspectRatio,
  })

  await sendButtons(
    phone,
    [
      `🎬 *Video Generation Summary*`,
      ``,
      `📸 Jewelry photo: Uploaded`,
      `🎥 Template: *${template?.name ?? 'Unknown'}*`,
      `✨ Style: *${sub?.name ?? 'Unknown'}*`,
      `📐 Aspect ratio: *${aspectRatio}*`,
      `💳 Cost: *${CREDIT_COST_VIDEO} credits*`,
      ``,
      `Ready to generate?`,
    ].join('\n'),
    [
      { type: 'reply', reply: { id: 'video_confirm_yes', title: '✅ Generate Video' } },
      { type: 'reply', reply: { id: 'video_confirm_no', title: '❌ Cancel' } },
    ],
  )
}

// ─── Step 5: Confirmation → enqueue job ─────────────────────────────────────

export async function handleVideoConfirm(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'interactive') {
    await sendText(phone, 'Please tap a button above to continue.')
    return
  }

  const interactive = (message as MetaInteractiveMessage).interactive
  const replyId =
    interactive?.type === 'button_reply'
      ? interactive.button_reply.id
      : ''

  if (replyId === 'video_confirm_no') {
    await resetSession(fastify.redis, phone)
    await sendText(phone, 'Cancelled. Type *menu* to start over.')
    return
  }

  if (replyId !== 'video_confirm_yes') {
    await sendText(phone, 'Please tap a button above to continue.')
    return
  }

  const session = await getSession(fastify.redis, phone)
  const data = session?.data ?? {}

  if (!data.videoSourceImageUrl || !data.videoTemplateId || !data.videoSubTemplateId || !data.videoAspectRatio) {
    await sendText(phone, 'Something went wrong. Please start over by typing *menu*.')
    await resetSession(fastify.redis, phone)
    return
  }

  const user = await findOrCreateUser(phone)

  // Check credits again before processing
  if (!(await hasCredits(user.id, CREDIT_COST_VIDEO))) {
    await sendText(
      phone,
      `You need at least *${CREDIT_COST_VIDEO} credits* but you don't have enough 😔\n\nType *menu* and tap *⬆️ Plans & Credits* to get more.`,
    )
    await resetSession(fastify.redis, phone)
    return
  }

  // Check if sub-template needs a logo
  const sub = getVideoSubTemplate(data.videoTemplateId, data.videoSubTemplateId)
  let logoUrl: string | undefined
  if (sub?.frame0UsesLogo) {
    const profile = await prisma.businessProfile.findUnique({ where: { ownerPhone: phone } })
    logoUrl = profile?.logoUrl ?? undefined
  }

  const jobId = randomUUID()

  // Create DB record
  await prisma.imageJob.create({
    data: {
      id: jobId,
      userId: user.id,
      sourceImageUrl: data.videoSourceImageUrl,
      jobType: 'video',
      status: 'QUEUED',
      templateId: data.videoTemplateId,
    },
  })

  await transitionState(fastify.redis, phone, 'VIDEO_PROCESSING', {})

  try {
    await enqueueVideoGenJob({
      jobId,
      userId: user.id,
      userPhone: phone,
      sourceImageUrl: data.videoSourceImageUrl,
      logoUrl,
      templateId: data.videoTemplateId,
      subTemplateId: data.videoSubTemplateId,
      aspectRatio: data.videoAspectRatio as '16:9' | '9:16',
    })

    logger.info({ phone, jobId }, 'Video gen job enqueued')
  } catch (err) {
    logger.error({ err, jobId }, 'Failed to enqueue video gen job')
    await sendText(phone, '❌ Failed to start video generation. Please try again.')
    await resetSession(fastify.redis, phone)
    return
  }

  await sendText(
    phone,
    "⏳ *Generating your video!*\n\nThis takes about 3–6 minutes. I'll send the video as soon as it's ready!\n\n_You can keep using other features while you wait._",
  )
}

// ─── Processing state: user sends message while waiting ─────────────────────

export async function handleVideoProcessing(
  phone: string,
  _fastify: FastifyInstance,
): Promise<void> {
  await sendText(phone, '⏳ Your video is still being generated. This takes 3–6 minutes. Please wait...')
}
