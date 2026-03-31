import type { FastifyInstance } from 'fastify'
import type { MetaMessage, MetaTextMessage, MetaImageMessage, MetaInteractiveMessage } from '../whatsapp/wa.types.js'
import { sendText, sendButtons, sendImage } from '../whatsapp/wa.messages.js'
import { setSession, getSession } from '../session/session.service.js'
import { prisma } from '@jewel/database'
import { downloadMediaBuffer } from '../whatsapp/wa.media.js'
import { uploadBuffer } from '../storage/cloudinary.service.js'
import { analyzeFestival } from '../features/festive-post/festival-analyzer.js'
import { enqueueFestivePostJob } from '../features/festive-post/festive-post.queue.js'
import { findOrCreateUser } from '../users/user.service.js'
import { deductCredit } from '../billing/credits.service.js'
import { logger } from '../shared/logger.js'
import { randomUUID } from 'node:crypto'

// ─── Entry point: check branding and start flow ──────────────────────────────

export async function startFestivePost(
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  // Check if branding details exist
  const profile = await prisma.businessProfile.findUnique({ where: { ownerPhone: phone } })

  if (profile?.logoUrl && profile?.name && profile?.phone) {
    // Branding already set — show summary and ask to proceed or edit
    await sendButtons(
      phone,
      `🎨 *Your Branding*\n\n🏢 *${profile.name}*\n📞 ${profile.phone}\n🖼️ Logo: Saved\n\nProceed with these details or edit them?`,
      [
        { type: 'reply', reply: { id: 'festive_proceed', title: '✅ Proceed' } },
        { type: 'reply', reply: { id: 'festive_edit', title: '✏️ Edit Branding' } },
      ],
    )
    // Store branding in session for later use
    await setSession(fastify.redis, phone, 'FESTIVE_CONFIRM', {
      festiveLogoUrl: profile.logoUrl,
      festiveBrandName: profile.name,
      festiveBrandPhone: profile.phone,
    })
    return
  }

  // Branding incomplete — start setup
  await sendText(phone, '🎨 *Festive Post Creator*\n\nFirst, let\'s set up your branding.\n\n🖼️ Please send your *company logo* as an image.')
  await setSession(fastify.redis, phone, 'FESTIVE_BRAND_LOGO', {})
}

// ─── Step 1: Receive logo image ──────────────────────────────────────────────

export async function handleFestiveBrandLogo(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'image') {
    await sendText(phone, '🖼️ Please send your company logo as an *image*.')
    return
  }

  const img = message as MetaImageMessage
  const mediaId = img.image.id

  try {
    const buffer = await downloadMediaBuffer(mediaId)
    const logoUrl = await uploadBuffer(buffer, 'jewel/logos')

    // Save logo to business profile
    await prisma.businessProfile.upsert({
      where: { ownerPhone: phone },
      update: { logoUrl },
      create: { ownerPhone: phone, name: '', address: '', state: '', logoUrl },
    })

    await sendText(phone, '✅ Logo saved!\n\n🏢 Now enter your *company/shop name*:')
    await setSession(fastify.redis, phone, 'FESTIVE_BRAND_NAME', { festiveLogoUrl: logoUrl })
  } catch (err) {
    logger.error({ err, phone }, 'Failed to process logo')
    await sendText(phone, 'Failed to process the image. Please try sending your logo again.')
  }
}

// ─── Step 2: Receive brand name ──────────────────────────────────────────────

export async function handleFestiveBrandName(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'text') {
    await sendText(phone, '🏢 Please type your *company/shop name*:')
    return
  }

  const name = (message as MetaTextMessage).text.body.trim()
  if (name.length < 2) {
    await sendText(phone, 'Name is too short. Please enter a valid company name.')
    return
  }

  const session = await getSession(fastify.redis, phone)

  await prisma.businessProfile.update({
    where: { ownerPhone: phone },
    data: { name },
  })

  await sendText(phone, `✅ Name: *${name}*\n\n📞 Now enter your *contact phone number* (displayed on the post):`)
  await setSession(fastify.redis, phone, 'FESTIVE_BRAND_PHONE', {
    ...session?.data,
    festiveBrandName: name,
  })
}

// ─── Step 3: Receive brand phone ─────────────────────────────────────────────

export async function handleFestiveBrandPhone(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'text') {
    await sendText(phone, '📞 Please type your *contact phone number*:')
    return
  }

  const brandPhone = (message as MetaTextMessage).text.body.trim()
  if (brandPhone.length < 8) {
    await sendText(phone, 'Please enter a valid phone number.')
    return
  }

  const session = await getSession(fastify.redis, phone)

  await prisma.businessProfile.update({
    where: { ownerPhone: phone },
    data: { phone: brandPhone },
  })

  const logoUrl = session?.data?.festiveLogoUrl ?? ''
  const brandName = session?.data?.festiveBrandName ?? ''

  await sendButtons(
    phone,
    `✅ *Branding Complete!*\n\n🏢 *${brandName}*\n📞 ${brandPhone}\n🖼️ Logo: Saved\n\nNow let's create your festive post!`,
    [
      { type: 'reply', reply: { id: 'festive_proceed', title: '✅ Continue' } },
    ],
  )

  await setSession(fastify.redis, phone, 'FESTIVE_CONFIRM', {
    festiveLogoUrl: logoUrl,
    festiveBrandName: brandName,
    festiveBrandPhone: brandPhone,
  })
}

// ─── Step 4: Confirm branding or ask for festival ────────────────────────────

export async function handleFestiveConfirm(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  let replyId = ''
  if (message.type === 'interactive') {
    const interactive = (message as MetaInteractiveMessage).interactive
    replyId =
      interactive?.type === 'button_reply'
        ? interactive.button_reply.id
        : interactive?.type === 'list_reply'
          ? interactive.list_reply.id
          : ''
  }

  if (replyId === 'festive_edit') {
    await sendText(phone, '🖼️ Please send your *company logo* as an image.')
    await setSession(fastify.redis, phone, 'FESTIVE_BRAND_LOGO', {})
    return
  }

  if (replyId === 'festive_proceed' || message.type === 'interactive') {
    const session = await getSession(fastify.redis, phone)
    await sendText(
      phone,
      '🎉 *Which festival or occasion* do you want to create a post for?\n\nExamples: Diwali, Eid, Christmas, Raksha Bandhan, Navratri, New Year, Akshaya Tritiya...\n\nType the festival name:',
    )
    await setSession(fastify.redis, phone, 'FESTIVE_FESTIVAL_INPUT', session?.data ?? {})
    return
  }

  await sendText(phone, 'Please tap a button above to continue.')
}

// ─── Step 5: Receive festival name → OpenAI analysis → enqueue ───────────────

export async function handleFestiveFestivalInput(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'text') {
    await sendText(phone, '🎉 Please *type the festival name* you want to create a post for:')
    return
  }

  const festivalName = (message as MetaTextMessage).text.body.trim()
  if (festivalName.length < 2) {
    await sendText(phone, 'Please enter a valid festival or occasion name.')
    return
  }

  const session = await getSession(fastify.redis, phone)
  const logoUrl = session?.data?.festiveLogoUrl ?? ''
  const brandName = session?.data?.festiveBrandName ?? ''
  const brandPhone = session?.data?.festiveBrandPhone ?? ''

  if (!logoUrl || !brandName || !brandPhone) {
    await sendText(phone, 'Branding details are missing. Let\'s start over.')
    await startFestivePost(phone, fastify)
    return
  }

  await sendText(phone, `🎨 Creating your *${festivalName}* festive post with branding...\n\n⏳ This may take 30-60 seconds. I'll send it as soon as it's ready!`)
  await setSession(fastify.redis, phone, 'FESTIVE_PROCESSING', {
    ...session?.data,
    festiveFestivalName: festivalName,
  })

  // Use OpenAI to analyze the festival and generate a detailed prompt
  try {
    const prompt = await analyzeFestival(festivalName, brandName, brandPhone, !!logoUrl)

    const user = await findOrCreateUser(phone)
    const jobId = randomUUID()

    // Create DB record
    await prisma.imageJob.create({
      data: {
        id: jobId,
        userId: user.id,
        sourceImageUrl: logoUrl,
        jobType: 'festive_post',
        status: 'QUEUED',
      },
    })

    // Enqueue BullMQ job
    await enqueueFestivePostJob({
      jobId,
      userId: user.id,
      userPhone: phone,
      logoUrl,
      brandName,
      brandPhone,
      festivalName,
      prompt,
    })

    logger.info({ phone, festivalName, jobId }, 'Festive post job enqueued')
  } catch (err) {
    logger.error({ err, phone }, 'Failed to create festive post')
    await sendText(phone, '❌ Something went wrong creating your festive post. Please try again.')
    await setSession(fastify.redis, phone, 'IDLE', {})
  }
}

// ─── Processing state: user sends message while waiting ──────────────────────

export async function handleFestiveProcessing(
  phone: string,
  _fastify: FastifyInstance,
): Promise<void> {
  await sendText(phone, '⏳ Your festive post is still being generated. Please wait a moment...')
}
