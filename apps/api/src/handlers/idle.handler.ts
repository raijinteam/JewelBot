import type { FastifyInstance } from 'fastify'
import type { MetaMessage } from '../whatsapp/wa.types.js'
import { sendList, sendText } from '../whatsapp/wa.messages.js'
import { setSession } from '../session/session.service.js'
import { findOrCreateUser } from '../users/user.service.js'
import { getCreditBalance } from '../billing/credits.service.js'
import { showLiveRates } from './price-calc.handler.js'
import { startBillingCalc } from './billing-calc.handler.js'
import { showLedgerMenu } from './ledger.handler.js'
import { showUpgradeMenu } from './upgrade.handler.js'
import { showBizProfile } from './business-profile.handler.js'

const WELCOME_NEW = (name: string) =>
  `Welcome to *JewelAI* 💎, ${name}!\n\nI help jewelry businesses create stunning professional product photos in seconds.\n\nYou get *5 free photo generations* to start.`

const WELCOME_BACK = (credits: number) =>
  `Welcome back! 👋\n\nYou have *${credits} credit${credits === 1 ? '' : 's'}* remaining.\n\nWhat would you like to do?`

async function showWelcome(
  phone: string,
  contactName: string | undefined,
  fastify: FastifyInstance,
): Promise<void> {
  const user = await findOrCreateUser(phone, contactName)
  const balance = await getCreditBalance(user.id)
  const isNew = Date.now() - new Date(user.createdAt).getTime() < 10_000

  const bodyText = isNew
    ? `${WELCOME_NEW(user.name ?? 'there')}\n\nTap the menu below to get started:`
    : WELCOME_BACK(balance)

  await sendList(
    phone,
    bodyText,
    '📋 Menu',
    [
      {
        title: 'Features',
        rows: [
          { id: 'start_photo', title: '📸 Create Photo', description: 'Generate professional product photos' },
          { id: 'price_calc', title: '💰 Live Rates', description: 'Live gold & silver prices' },
          { id: 'billing_calc', title: '📋 Billing Calculator', description: 'Generate itemized bill estimate' },
          { id: 'gen_invoice', title: '📄 GST Invoice', description: 'Create a tax invoice with GST' },
          { id: 'ledger', title: '📒 Udhaar Book', description: 'Track customer credit & dues' },
        ],
      },
      {
        title: 'Account',
        rows: [
          { id: 'view_credits', title: '💳 My Credits', description: 'Check your remaining credits' },
          { id: 'upgrade', title: '⬆️ Upgrade Plan', description: 'Get more credits & features' },
          { id: 'my_business', title: '⚙️ My Business', description: 'View & edit business profile' },
          { id: 'help', title: '❓ Help', description: 'How to use JewelAI' },
        ],
      },
    ],
    '💎 JewelAI',
  )

  await setSession(fastify.redis, phone, 'IDLE', {})
}

export async function handleIdleInteractive(
  replyId: string,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (replyId === 'start_photo') {
    await setSession(fastify.redis, phone, 'AWAITING_IMAGE', {})
    await sendText(phone, '📸 Please send me a clear photo of the jewelry you want to enhance.')
    return
  }
  if (replyId === 'price_calc') {
    await showLiveRates(phone, fastify)
    return
  }
  if (replyId === 'billing_calc') {
    await startBillingCalc(phone, fastify)
    return
  }
  if (replyId === 'gen_invoice') {
    await startBillingCalc(phone, fastify, true)
    return
  }
  if (replyId === 'view_credits') {
    const user = await findOrCreateUser(phone)
    const balance = await getCreditBalance(user.id)
    await sendText(
      phone,
      `💳 *Your Credits*\n\nYou have *${balance} credit${balance === 1 ? '' : 's'}* remaining.\n\nEach photo generation uses 1 credit.`,
    )
    return
  }
  if (replyId === 'ledger') {
    await showLedgerMenu(phone, fastify)
    return
  }
  if (replyId === 'upgrade') {
    await showUpgradeMenu(phone, fastify)
    return
  }
  if (replyId === 'my_business') {
    await showBizProfile(phone, fastify)
    return
  }
  if (replyId === 'help') {
    await sendText(
      phone,
      `❓ *How JewelAI works*\n\n1️⃣ Tap *Create Photo* and send a jewelry image\n2️⃣ Choose a background style\n3️⃣ Confirm and receive your professional photo\n\n💰 *Live Rates*\nGet live gold/silver prices instantly.\n\n📋 *Billing Calculator*\nGenerate itemized bill estimates with live rates.\n\n📄 *GST Invoice*\nCreate a full tax invoice with CGST/SGST breakdown.\n\nNeed help? Contact us at support@jewel.ai`,
    )
    return
  }
  await showWelcome(phone, undefined, fastify)
}

export async function handleIdle(
  _message: MetaMessage,
  phone: string,
  contactName: string | undefined,
  fastify: FastifyInstance,
): Promise<void> {
  await showWelcome(phone, contactName, fastify)
}
