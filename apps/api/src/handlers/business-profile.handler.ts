import type { FastifyInstance } from 'fastify'
import type { MetaMessage, MetaInteractiveMessage, MetaTextMessage } from '../whatsapp/wa.types.js'
import { sendText, sendButtons } from '../whatsapp/wa.messages.js'
import { setSession, getSession, resetSession, transitionState } from '../session/session.service.js'
import { prisma } from '@jewel/database'

// ── Start business profile setup ──────────────────────────────────────────────

export async function startBizProfileSetup(
  phone: string,
  fastify: FastifyInstance,
  returnToInvoice = false,
): Promise<void> {
  await setSession(fastify.redis, phone, 'BIZ_NAME', { bizSetupReturnToInvoice: returnToInvoice })
  await sendText(
    phone,
    [
      `⚙️ *Business Profile Setup*`,
      ``,
      `This will be used on all your GST invoices.`,
      ``,
      `Enter your *business name*:`,
      `_(e.g. Kryshnaya Jewellers)_`,
    ].join('\n'),
  )
}

// ── Show existing profile ─────────────────────────────────────────────────────

export async function showBizProfile(phone: string, fastify: FastifyInstance): Promise<void> {
  const profile = await prisma.businessProfile.findUnique({ where: { ownerPhone: phone } })

  if (!profile) {
    await startBizProfileSetup(phone, fastify, false)
    return
  }

  const lines = [
    `⚙️ *Your Business Profile*`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `🏪 Name: *${profile.name}*`,
    ...(profile.gstin ? [`📋 GSTIN: ${profile.gstin}`] : [`📋 GSTIN: Not set`]),
    `📍 Address: ${profile.address}`,
    `🗺️ State: ${profile.state}`,
    ...(profile.phone ? [`📞 Phone: ${profile.phone}`] : []),
  ]

  await sendText(phone, lines.join('\n'))
  await sendButtons(phone, 'Would you like to update your profile?', [
    { type: 'reply', reply: { id: 'biz_edit', title: '✏️ Edit Profile' } },
    { type: 'reply', reply: { id: 'biz_done', title: '✅ Done' } },
  ])
  await setSession(fastify.redis, phone, 'BIZ_NAME', { bizSetupReturnToInvoice: false })
}

// ── Handle biz profile menu buttons (from showBizProfile) ─────────────────────

export async function handleBizProfileMenu(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type === 'interactive') {
    const interactive = (message as MetaInteractiveMessage).interactive
    const replyId = interactive?.type === 'button_reply' ? interactive.button_reply.id : ''
    if (replyId === 'biz_edit') {
      await startBizProfileSetup(phone, fastify, false)
      return
    }
    if (replyId === 'biz_done') {
      await resetSession(fastify.redis, phone)
      return
    }
  }
  await resetSession(fastify.redis, phone)
}

// ── Step 1: Business name ─────────────────────────────────────────────────────

export async function handleBizName(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type === 'interactive') {
    const interactive = (message as MetaInteractiveMessage).interactive
    const replyId = interactive?.type === 'button_reply' ? interactive.button_reply.id : ''
    if (replyId === 'biz_edit') {
      await startBizProfileSetup(phone, fastify, false)
      return
    }
    if (replyId === 'biz_done') {
      await resetSession(fastify.redis, phone)
      return
    }
  }

  if (message.type !== 'text') {
    await sendText(phone, 'Please type your business name:')
    return
  }

  const name = (message as MetaTextMessage).text.body.trim()
  if (name.length < 2 || name.length > 100) {
    await sendText(phone, '❌ Please enter a valid business name (2–100 characters).')
    return
  }

  const session = await getSession(fastify.redis, phone)
  await setSession(fastify.redis, phone, 'BIZ_GSTIN', {
    ...session?.data,
    bizSetupName: name,
  })

  await sendButtons(
    phone,
    `✅ Business name: *${name}*\n\nDo you have a *GSTIN*?`,
    [
      { type: 'reply', reply: { id: 'biz_gstin_yes', title: '✅ Yes, enter GSTIN' } },
      { type: 'reply', reply: { id: 'biz_gstin_skip', title: '⏭️ Skip' } },
    ],
  )
}

// ── Step 2: GSTIN ─────────────────────────────────────────────────────────────

export async function handleBizGstin(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  const session = await getSession(fastify.redis, phone)

  if (message.type === 'interactive') {
    const interactive = (message as MetaInteractiveMessage).interactive
    const replyId = interactive?.type === 'button_reply' ? interactive.button_reply.id : ''

    if (replyId === 'biz_gstin_skip') {
      await setSession(fastify.redis, phone, 'BIZ_ADDRESS', {
        ...session?.data,
        bizSetupGstin: '',
      })
      await sendText(phone, '📍 Enter your *shop address*:\n_(Full address including city & pincode)_')
      return
    }

    if (replyId === 'biz_gstin_yes') {
      await sendText(phone, 'Enter your *GSTIN* (15 characters):\n_(e.g. 27AABCU9603R1ZM)_')
      return
    }
  }

  if (message.type === 'text') {
    const gstin = (message as MetaTextMessage).text.body.trim().toUpperCase()
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
    if (!gstinRegex.test(gstin)) {
      await sendText(phone, '❌ Invalid GSTIN. Please enter a valid 15-character GSTIN:\n_(e.g. 27AABCU9603R1ZM)_')
      return
    }

    await setSession(fastify.redis, phone, 'BIZ_ADDRESS', {
      ...session?.data,
      bizSetupGstin: gstin,
    })
    await sendText(phone, `✅ GSTIN: *${gstin}*\n\n📍 Enter your *shop address*:\n_(Full address including city & pincode)_`)
    return
  }

  await sendText(phone, 'Please enter your GSTIN or tap Skip.')
}

// ── Step 3: Address ───────────────────────────────────────────────────────────

export async function handleBizAddress(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'text') {
    await sendText(phone, 'Please type your shop address:')
    return
  }

  const address = (message as MetaTextMessage).text.body.trim().slice(0, 200)
  if (address.length < 5) {
    await sendText(phone, '❌ Please enter a valid address.')
    return
  }

  const session = await getSession(fastify.redis, phone)
  await setSession(fastify.redis, phone, 'BIZ_STATE', {
    ...session?.data,
    bizSetupAddress: address,
  })

  await sendText(phone, `✅ Address saved.\n\n🗺️ Enter your *state name*:\n_(e.g. Gujarat, Maharashtra, Rajasthan)_`)
}

// ── Step 4: State ─────────────────────────────────────────────────────────────

export async function handleBizState(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'text') {
    await sendText(phone, 'Please type your state name:')
    return
  }

  const state = (message as MetaTextMessage).text.body.trim()
  if (state.length < 2) {
    await sendText(phone, '❌ Please enter a valid state name.')
    return
  }

  const session = await getSession(fastify.redis, phone)
  await setSession(fastify.redis, phone, 'BIZ_PHONE', {
    ...session?.data,
    bizSetupState: state,
  })

  await sendButtons(
    phone,
    `✅ State: *${state}*\n\n📞 Enter your *business phone number*:`,
    [
      { type: 'reply', reply: { id: 'biz_phone_same', title: '📱 Use this number' } },
      { type: 'reply', reply: { id: 'biz_phone_skip', title: '⏭️ Skip' } },
    ],
  )
}

// ── Step 5: Phone → Save ──────────────────────────────────────────────────────

export async function handleBizPhone(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  const session = await getSession(fastify.redis, phone)
  const data = session?.data
  let bizPhone: string | null = null

  if (message.type === 'interactive') {
    const interactive = (message as MetaInteractiveMessage).interactive
    const replyId = interactive?.type === 'button_reply' ? interactive.button_reply.id : ''
    if (replyId === 'biz_phone_same') bizPhone = phone
    else if (replyId === 'biz_phone_skip') bizPhone = null
  } else if (message.type === 'text') {
    bizPhone = (message as MetaTextMessage).text.body.trim().replace(/\D/g, '').slice(-10)
  }

  if (!data?.bizSetupName || !data?.bizSetupAddress || !data?.bizSetupState) {
    await sendText(phone, '⚠️ Session expired. Please start profile setup again from the menu.')
    await resetSession(fastify.redis, phone)
    return
  }

  // Save to DB
  await prisma.businessProfile.upsert({
    where: { ownerPhone: phone },
    create: {
      ownerPhone: phone,
      name: data.bizSetupName,
      gstin: data.bizSetupGstin || null,
      address: data.bizSetupAddress,
      state: data.bizSetupState,
      phone: bizPhone,
    },
    update: {
      name: data.bizSetupName,
      gstin: data.bizSetupGstin || null,
      address: data.bizSetupAddress,
      state: data.bizSetupState,
      phone: bizPhone,
    },
  })

  await sendText(
    phone,
    [
      `✅ *Business Profile Saved!*`,
      ``,
      `🏪 *${data.bizSetupName}*`,
      ...(data.bizSetupGstin ? [`GSTIN: ${data.bizSetupGstin}`] : []),
      `📍 ${data.bizSetupAddress}`,
      `🗺️ ${data.bizSetupState}`,
      ...(bizPhone ? [`📞 ${bizPhone}`] : []),
    ].join('\n'),
  )

  // If triggered from invoice flow, go back to invoice
  if (data.bizSetupReturnToInvoice) {
    await transitionState(fastify.redis, phone, 'INVOICE_CUSTOMER_NAME', {})
    await sendText(phone, '📄 *Generate GST Invoice*\n\nEnter the *customer name*:')
    return
  }

  await resetSession(fastify.redis, phone)
}
