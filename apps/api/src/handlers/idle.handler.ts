import type { FastifyInstance } from 'fastify'
import type { MetaMessage } from '../whatsapp/wa.types.js'
import { sendList, sendText, sendButtons } from '../whatsapp/wa.messages.js'
import { setSession } from '../session/session.service.js'
import { findOrCreateUser } from '../users/user.service.js'
import { getCreditBalance, hasPaidPlan } from '../billing/credits.service.js'
import { showLiveRates } from './price-calc.handler.js'
import { startBillingCalc } from './billing-calc.handler.js'
import { showLedgerMenu } from './ledger.handler.js'
import { showUpgradeMenu } from './upgrade.handler.js'
import { showBizProfile } from './business-profile.handler.js'
import { startFestivePost } from './festive-post.handler.js'
import { startBatchCreate } from './batch-create.handler.js'
import { showJewelTypeMenu } from './awaiting-jewel-type.handler.js'

const WELCOME_NEW = (name: string) =>
  `Welcome to *SvaraAI* 💎, ${name}!\n\nI help jewelry businesses create stunning professional product photos in seconds.\n\nYou get *25 free credits* to start (5 credits per photo).`

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

  const paid = await hasPaidPlan(user.id)

  await sendList(
    phone,
    bodyText,
    '📋 Menu',
    [
      {
        title: 'Free Features',
        rows: [
          { id: 'start_photo', title: '📸 Create Photo', description: 'AI product photos (5 credits each)' },
          { id: 'batch_create', title: '📸 Batch Photos', description: 'Process up to 10 photos at once' },
          { id: 'festive_post', title: '🎉 Festive Posts', description: 'Branded festival greetings' },
        ],
      },
      {
        title: paid ? 'Pro Features' : 'Pro Features 🔒 (Starter Plan)',
        rows: [
          { id: 'price_calc', title: '💰 Live Rates', description: paid ? 'Live gold & silver prices' : '🔒 Requires Starter plan' },
          { id: 'billing_calc', title: '📋 Billing Calculator', description: paid ? 'Generate itemized bill estimate' : '🔒 Requires Starter plan' },
          { id: 'gen_invoice', title: '📄 GST Invoice', description: paid ? 'Create a tax invoice with GST' : '🔒 Requires Starter plan' },
          { id: 'ledger', title: '📒 Udhaar Book', description: paid ? 'Track customer credit & dues' : '🔒 Requires Starter plan' },
          { id: 'my_business', title: '⚙️ My Business', description: paid ? 'View & edit business profile' : '🔒 Requires Starter plan' },
        ],
      },
      {
        title: 'Account',
        rows: [
          { id: 'view_credits', title: '💳 My Credits', description: 'Check your remaining credits' },
          { id: 'upgrade', title: '⬆️ Plans & Credits', description: 'Subscribe or buy credit packs' },
        ],
      },
    ],
    '💎 SvaraAI',
  )

  await setSession(fastify.redis, phone, 'IDLE', {})
}

export async function handleIdleInteractive(
  replyId: string,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  // Features that require a paid plan
  const paidFeatures = ['price_calc', 'billing_calc', 'gen_invoice', 'ledger', 'my_business']

  if (paidFeatures.includes(replyId)) {
    const user = await findOrCreateUser(phone)
    const paid = await hasPaidPlan(user.id)
    if (!paid) {
      await sendButtons(
        phone,
        [
          `🔒 *Subscription Required*`,
          ``,
          `Subscribe to *Starter Plan (₹99/mo)* to unlock:`,
          `• 💰 Live Gold & Silver Rates`,
          `• 📋 Billing Calculator`,
          `• 📄 GST Invoice Generator`,
          `• 📒 Udhaar Book`,
          `• ⚙️ Business Profile`,
          `• 100 credits/month for photo generation`,
        ].join('\n'),
        [
          { type: 'reply', reply: { id: 'upgrade', title: '⬆️ Subscribe Now' } },
          { type: 'reply', reply: { id: 'cancel', title: '❌ Cancel' } },
        ],
      )
      return
    }
  }

  if (replyId === 'start_photo') {
    await showJewelTypeMenu(phone, fastify)
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
      `💳 *Your Credits*\n\nYou have *${balance} credit${balance === 1 ? '' : 's'}* remaining.\n\nEach photo generation uses *5 credits*.`,
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
  if (replyId === 'batch_create') {
    await startBatchCreate(phone, fastify)
    return
  }
  if (replyId === 'festive_post') {
    await startFestivePost(phone, fastify)
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
