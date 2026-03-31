import type { FastifyInstance } from 'fastify'
import type { MetaMessage, MetaInteractiveMessage } from '../whatsapp/wa.types.js'
import { sendText, sendList } from '../whatsapp/wa.messages.js'
import { setSession, resetSession } from '../session/session.service.js'
import { getPlanPrice } from '../billing/app-config.service.js'
import { createPaymentLink } from '../billing/razorpay.service.js'
import { env } from '../config/env.js'
import { CREDIT_PACKS } from '@jewel/shared-types'

export async function showUpgradeMenu(phone: string, fastify: FastifyInstance): Promise<void> {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    await sendText(phone, '⚠️ Payment system is not configured yet. Please contact support.')
    await resetSession(fastify.redis, phone)
    return
  }

  const [starterPrice, shopPrice, proPrice, wholesalePrice] = await Promise.all([
    getPlanPrice(fastify.redis, 'starter'),
    getPlanPrice(fastify.redis, 'shop'),
    getPlanPrice(fastify.redis, 'pro'),
    getPlanPrice(fastify.redis, 'wholesale'),
  ])

  await setSession(fastify.redis, phone, 'UPGRADE_SELECT', {})

  await sendList(
    phone,
    '⬆️ *Upgrade Your Plan*\n\nSubscribe to unlock all features and get monthly credits.\nOr buy a one-time credit pack.\n\n_Each photo costs 5 credits._',
    '💳 Select Option',
    [
      {
        title: 'Monthly Plans',
        rows: [
          { id: 'upgrade_starter', title: `Starter — ₹${starterPrice}/mo`, description: '50 credits/month' },
          { id: 'upgrade_shop', title: `Shop — ₹${shopPrice}/mo`, description: '200 credits/month' },
          { id: 'upgrade_pro', title: `Pro — ₹${proPrice}/mo`, description: '500 credits/month' },
          { id: 'upgrade_wholesale', title: `Wholesale — ₹${wholesalePrice}/mo`, description: '1400 credits/month' },
        ],
      },
      {
        title: 'Buy Credits (One-time)',
        rows: CREDIT_PACKS.map((pack) => ({
          id: pack.id,
          title: `${pack.credits} Credits — ₹${pack.priceInr}`,
          description: `₹${(pack.priceInr / pack.credits).toFixed(1)}/credit`,
        })),
      },
    ],
    '💳 Plans & Credits',
  )
}

export async function handleUpgradeSelect(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'interactive') {
    await showUpgradeMenu(phone, fastify)
    return
  }

  const interactive = (message as MetaInteractiveMessage).interactive
  const replyId =
    interactive?.type === 'list_reply'
      ? interactive.list_reply.id
      : interactive?.type === 'button_reply'
        ? interactive.button_reply.id
        : ''

  // Handle credit pack selection directly
  const pack = CREDIT_PACKS.find((p) => p.id === replyId)
  if (pack) {
    await sendText(phone, `⏳ Generating your payment link for *${pack.credits} credits (₹${pack.priceInr})*...`)

    try {
      const link = await createPaymentLink({
        amount: pack.priceInr,
        customerPhone: phone,
        planName: `CREDIT_PACK_${pack.credits}`,
        description: `JewelAI ${pack.credits} Credits Pack — ₹${pack.priceInr}`,
      })

      await sendText(
        phone,
        [
          `🛒 *${pack.credits} Credits — ₹${pack.priceInr}*`,
          ``,
          `Tap the link below to complete payment:`,
          `👉 ${link.short_url}`,
          ``,
          `✅ Credits will be added *automatically* once payment is done.`,
          `_Link expires in 24 hours._`,
        ].join('\n'),
      )
    } catch (err) {
      await sendText(phone, '❌ Could not generate payment link. Please try again or contact support.')
    }

    await resetSession(fastify.redis, phone)
    return
  }

  const planMap: Record<string, { plan: string; label: string }> = {
    upgrade_starter: { plan: 'STARTER', label: 'Starter' },
    upgrade_shop: { plan: 'SHOP', label: 'Shop' },
    upgrade_pro: { plan: 'PRO', label: 'Pro' },
    upgrade_wholesale: { plan: 'WHOLESALE', label: 'Wholesale' },
  }

  const selected = planMap[replyId]
  if (!selected) {
    await showUpgradeMenu(phone, fastify)
    return
  }

  const price = await getPlanPrice(fastify.redis, selected.plan)

  await sendText(phone, `⏳ Generating your payment link for *${selected.label} Plan (₹${price}/mo)*...`)

  try {
    const link = await createPaymentLink({
      amount: price,
      customerPhone: phone,
      planName: selected.plan,
      description: `JewelAI ${selected.label} Plan — ₹${price}/month`,
    })

    await sendText(
      phone,
      [
        `💳 *${selected.label} Plan — ₹${price}/month*`,
        ``,
        `Tap the link below to complete payment:`,
        `👉 ${link.short_url}`,
        ``,
        `✅ Your plan will activate *automatically* once payment is done.`,
        `_Link expires in 24 hours._`,
      ].join('\n'),
    )
  } catch (err) {
    await sendText(phone, '❌ Could not generate payment link. Please try again or contact support.')
  }

  await resetSession(fastify.redis, phone)
}


