import type { FastifyInstance } from 'fastify'
import type { MetaMessage, MetaImageMessage, MetaInteractiveMessage } from '../whatsapp/wa.types.js'
import { sendText, sendButtons, sendList } from '../whatsapp/wa.messages.js'
import { getSession, setSession, transitionState, resetSession } from '../session/session.service.js'
import { downloadMediaBuffer } from '../whatsapp/wa.media.js'
import { uploadBuffer } from '../storage/cloudinary.service.js'
import { findOrCreateUser } from '../users/user.service.js'
import { hasCredits, getCreditBalance } from '../billing/credits.service.js'
import { analyzeJewelryImage } from '../features/image-generation/jewelry-analyzer.js'
import { getCompatibleTemplates, getTemplateById } from '../features/image-generation/templates.service.js'
import { enqueueImageGenJob } from '../features/image-generation/image-gen.queue.js'
import { prisma } from '@jewel/database'
import { logger } from '../shared/logger.js'
import type { Template } from '@jewel/database'

const MAX_BATCH_SIZE = 10

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function startBatchCreate(
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  const user = await findOrCreateUser(phone)

  if (!(await hasCredits(user.id))) {
    await sendText(
      phone,
      "You're out of credits 😔\n\nUpgrade to continue generating professional product photos.\n\nReply *UPGRADE* to see our plans.",
    )
    return
  }

  await sendText(
    phone,
    `📸 *Batch Photo Creator*\n\nSelect up to *${MAX_BATCH_SIZE} photos* from your gallery and send them all at once.\n\nI'll analyze each one automatically. When you're done sending, tap the *✅ Done* button.`,
  )
  await setSession(fastify.redis, phone, 'BATCH_COLLECTING', {
    batchImages: [],
    batchLastImageTime: Date.now(),
  })
}

// ─── Collecting images ───────────────────────────────────────────────────────

export async function handleBatchCollecting(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  // Handle "Done" button
  if (message.type === 'interactive') {
    const interactive = (message as MetaInteractiveMessage).interactive
    const replyId =
      interactive?.type === 'button_reply'
        ? interactive.button_reply.id
        : ''

    if (replyId === 'batch_done') {
      return finishCollecting(phone, fastify)
    }
    if (replyId === 'batch_cancel') {
      await resetSession(fastify.redis, phone)
      await sendText(phone, 'Batch cancelled. Send me a photo anytime to start again!')
      return
    }
    return
  }

  // Only accept images
  if (message.type !== 'image') {
    const session = await getSession(fastify.redis, phone)
    const count = session?.data?.batchImages?.length ?? 0
    if (count > 0) {
      await sendButtons(
        phone,
        `📷 *${count} image${count === 1 ? '' : 's'}* received so far.\n\nSend more photos or tap Done.`,
        [
          { type: 'reply', reply: { id: 'batch_done', title: '✅ Done' } },
          { type: 'reply', reply: { id: 'batch_cancel', title: '❌ Cancel' } },
        ],
      )
    } else {
      await sendText(phone, '📸 Please send jewelry *photos* to add to the batch.')
    }
    return
  }

  const session = await getSession(fastify.redis, phone)
  const images = session?.data?.batchImages ?? []

  if (images.length >= MAX_BATCH_SIZE) {
    await sendButtons(
      phone,
      `⚠️ Maximum ${MAX_BATCH_SIZE} images reached!\n\nTap Done to proceed with these ${MAX_BATCH_SIZE} photos.`,
      [
        { type: 'reply', reply: { id: 'batch_done', title: '✅ Done' } },
      ],
    )
    return
  }

  const img = message as MetaImageMessage

  try {
    // Download and upload
    const buffer = await downloadMediaBuffer(img.image.id)
    const user = await findOrCreateUser(phone)
    const sourceUrl = await uploadBuffer(buffer, `jewel/source/${user.id}`)

    // Analyze with GPT-4o
    const analysis = await analyzeJewelryImage(sourceUrl)

    const updatedImages = [
      ...images,
      { url: sourceUrl, jewellType: analysis.jewel_type, description: analysis.description },
    ]

    const now = Date.now()
    await setSession(fastify.redis, phone, 'BATCH_COLLECTING', {
      ...session?.data,
      batchImages: updatedImages,
      batchLastImageTime: now,
    })

    // Debounce: wait briefly then show count + Done button
    // Only show the button if no new image arrives within 3 seconds
    setTimeout(async () => {
      try {
        const currentSession = await getSession(fastify.redis, phone)
        if (
          currentSession?.state === 'BATCH_COLLECTING' &&
          currentSession?.data?.batchLastImageTime === now
        ) {
          const count = currentSession.data.batchImages?.length ?? 0
          await sendButtons(
            phone,
            `📷 *${count} image${count === 1 ? '' : 's'}* received and analyzed!\n\nSend more photos or tap Done to choose a template.`,
            [
              { type: 'reply', reply: { id: 'batch_done', title: '✅ Done' } },
              { type: 'reply', reply: { id: 'batch_cancel', title: '❌ Cancel' } },
            ],
          )
        }
      } catch {
        // Ignore debounce errors
      }
    }, 3000)

    logger.info({ phone, count: updatedImages.length, type: analysis.jewel_type }, 'Batch image added')
  } catch (err) {
    logger.error({ err, phone }, 'Failed to process batch image')
    await sendText(phone, '⚠️ Failed to process that image. Try sending it again.')
  }
}

// ─── Finish collecting → show template list ──────────────────────────────────

async function finishCollecting(phone: string, fastify: FastifyInstance): Promise<void> {
  const session = await getSession(fastify.redis, phone)
  const images = session?.data?.batchImages ?? []

  if (images.length === 0) {
    await sendText(phone, 'No images received. Please send at least one photo.')
    return
  }

  // Credit check
  const user = await findOrCreateUser(phone)
  const balance = await getCreditBalance(user.id)

  if (balance < images.length) {
    await sendText(
      phone,
      `⚠️ You need *${images.length} credits* but only have *${balance}*.\n\nRemove some photos or upgrade your plan.`,
    )
    await resetSession(fastify.redis, phone)
    return
  }

  // Get templates compatible with the most common jewel type
  const subscription = await fastify.prisma.subscription.findUnique({ where: { userId: user.id } })
  const templates = await getCompatibleTemplates('*', subscription?.plan ?? 'FREE')

  if (!templates.length) {
    await sendText(phone, 'No templates available. Please contact support.')
    await resetSession(fastify.redis, phone)
    return
  }

  await transitionState(fastify.redis, phone, 'BATCH_TEMPLATE')
  await sendBatchTemplateList(phone, images.length, templates)
}

async function sendBatchTemplateList(phone: string, imageCount: number, templates: Template[]): Promise<void> {
  const grouped = new Map<string, Template[]>()
  for (const tpl of templates) {
    if (!grouped.has(tpl.category)) grouped.set(tpl.category, [])
    grouped.get(tpl.category)!.push(tpl)
  }

  const sections = []
  let rowCount = 0
  for (const [category, tpls] of grouped) {
    if (rowCount >= 10) break
    const rows = tpls.slice(0, 10 - rowCount).map((t) => ({
      id: t.id,
      title: t.name,
      description: t.category,
    }))
    sections.push({ title: category, rows })
    rowCount += rows.length
  }

  await sendList(
    phone,
    `📸 *${imageCount} images* ready!\n\nChoose a template to apply to *all* photos:`,
    'Select Template',
    sections,
    '🎨 Choose Style for Batch',
  )
}

// ─── Template selection ──────────────────────────────────────────────────────

export async function handleBatchTemplate(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'interactive') return

  const interactive = (message as MetaInteractiveMessage).interactive
  if (interactive.type !== 'list_reply') return

  const templateId = interactive.list_reply.id
  const template = await getTemplateById(templateId)

  if (!template) return

  await transitionState(fastify.redis, phone, 'BATCH_ASPECT_RATIO', {
    batchTemplateId: templateId,
    batchTemplateName: template.name,
  })

  await sendButtons(
    phone,
    `*${template.name}*\n_${template.category}_\n\nChoose the aspect ratio for *all* photos:`,
    [
      { type: 'reply', reply: { id: 'ratio_1_1', title: '⬜ Square (1:1)' } },
      { type: 'reply', reply: { id: 'ratio_9_16', title: '📱 Portrait (9:16)' } },
      { type: 'reply', reply: { id: 'batch_cancel', title: '❌ Cancel' } },
    ],
  )
}

// ─── Aspect ratio selection ──────────────────────────────────────────────────

export async function handleBatchAspectRatio(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'interactive') return

  const interactive = (message as MetaInteractiveMessage).interactive
  if (interactive.type !== 'button_reply') return

  const buttonId = interactive.button_reply.id

  if (buttonId === 'batch_cancel') {
    await resetSession(fastify.redis, phone)
    await sendText(phone, 'Batch cancelled.')
    return
  }

  const aspectRatio = buttonId === 'ratio_9_16' ? '9:16' as const : '1:1' as const

  const session = await getSession(fastify.redis, phone)
  const images = session?.data?.batchImages ?? []
  const templateName = session?.data?.batchTemplateName ?? 'Selected template'
  const ratioLabel = aspectRatio === '1:1' ? 'Square (1:1)' : 'Portrait (9:16)'

  await transitionState(fastify.redis, phone, 'BATCH_CONFIRM', {
    batchAspectRatio: aspectRatio,
  })

  await sendButtons(
    phone,
    `📸 *Batch Summary*\n\n🖼️ Images: *${images.length}*\n🎨 Template: *${templateName}*\n📐 Ratio: *${ratioLabel}*\n💳 Credits used: *${images.length}*\n\nReady to generate all photos?`,
    [
      { type: 'reply', reply: { id: 'batch_generate', title: '✅ Generate All!' } },
      { type: 'reply', reply: { id: 'batch_cancel', title: '❌ Cancel' } },
    ],
  )
}

// ─── Confirmation → enqueue all jobs ─────────────────────────────────────────

export async function handleBatchConfirm(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'interactive') return

  const interactive = (message as MetaInteractiveMessage).interactive
  if (interactive.type !== 'button_reply') return

  const buttonId = interactive.button_reply.id

  if (buttonId === 'batch_cancel') {
    await resetSession(fastify.redis, phone)
    await sendText(phone, 'Batch cancelled.')
    return
  }

  if (buttonId !== 'batch_generate') return

  const session = await getSession(fastify.redis, phone)
  const data = session?.data ?? {}
  const images = data.batchImages ?? []
  const templateId = data.batchTemplateId
  const aspectRatio = (data.batchAspectRatio ?? '1:1') as '1:1' | '9:16'

  if (!images.length || !templateId) {
    await sendText(phone, 'Something went wrong. Please start over.')
    await resetSession(fastify.redis, phone)
    return
  }

  // Final credit check
  const user = await findOrCreateUser(phone)
  const balance = await getCreditBalance(user.id)

  if (balance < images.length) {
    await sendText(phone, `⚠️ Not enough credits. You need ${images.length} but have ${balance}.`)
    await resetSession(fastify.redis, phone)
    return
  }

  await transitionState(fastify.redis, phone, 'BATCH_PROCESSING')

  await sendText(
    phone,
    `⏳ *Generating ${images.length} photos!*\n\nThis may take a few minutes. I'll send each photo as it's ready.`,
  )

  // Enqueue all jobs
  for (const img of images) {
    try {
      const dbJob = await prisma.imageJob.create({
        data: {
          userId: user.id,
          status: 'QUEUED',
          sourceImageUrl: img.url,
          templateId,
          jobType: 'batch',
          jewellType: img.jewellType,
          jewellDesc: img.description,
        },
      })

      await enqueueImageGenJob({
        jobId: dbJob.id,
        userId: user.id,
        userPhone: phone,
        sourceImageUrl: img.url,
        templateId,
        jewellType: img.jewellType,
        jewellDescription: img.description,
        aspectRatio,
      })

      logger.info({ jobId: dbJob.id, userId: user.id }, 'Batch image job enqueued')
    } catch (err) {
      logger.error({ err, phone }, 'Failed to enqueue batch image job')
    }
  }
}

// ─── Processing state ────────────────────────────────────────────────────────

export async function handleBatchProcessing(
  phone: string,
  _fastify: FastifyInstance,
): Promise<void> {
  await sendText(phone, '⏳ Your batch is still being generated. Each photo will be sent as it\'s ready!')
}
