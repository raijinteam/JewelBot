import type { FastifyInstance } from 'fastify'
import type { MetaMessage, MetaInteractiveMessage, MetaTextMessage } from '../whatsapp/wa.types.js'
import { sendText, sendButtons, sendList } from '../whatsapp/wa.messages.js'
import { setSession, getSession, resetSession, transitionState } from '../session/session.service.js'
import { getMetalRates, ALL_METALS } from '../features/price-calculator/metals-rate.service.js'

// ── Step 1: Show metal + purity selection ────────────────────────────────────

export async function startBillingCalc(phone: string, fastify: FastifyInstance, invoiceMode = false): Promise<void> {
  await setSession(fastify.redis, phone, 'BILLING_METAL', { invoiceMode })

  await sendList(
    phone,
    'Select the *metal and purity* for billing:',
    '🪙 Select Metal',
    [
      {
        title: 'Gold',
        rows: [
          { id: 'bill_gold_24k', title: 'Gold 24K (99.9%)' },
          { id: 'bill_gold_22k', title: 'Gold 22K (91.6%)' },
          { id: 'bill_gold_18k', title: 'Gold 18K (75.0%)' },
        ],
      },
      {
        title: 'Silver',
        rows: [
          { id: 'bill_silver_999', title: 'Silver 999 (99.9%)' },
          { id: 'bill_silver_925', title: 'Silver 925 (92.5%)' },
        ],
      },
    ],
    '📋 Billing Calculator',
  )
}

// ── Step 2: Handle metal selection → ask weight ──────────────────────────────

export async function handleBillingMetal(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'interactive') {
    await sendText(phone, '👆 Please select a metal from the list above.')
    return
  }

  const interactive = (message as MetaInteractiveMessage).interactive
  const replyId =
    interactive?.type === 'list_reply'
      ? interactive.list_reply.id
      : interactive?.type === 'button_reply'
        ? interactive.button_reply.id
        : ''

  // Extract metal key from reply ID (e.g. 'bill_gold_24k' → 'gold_24k')
  const metalKey = replyId.replace('bill_', '')

  if (!ALL_METALS[metalKey]) {
    await sendText(phone, '❌ Invalid selection. Please pick a metal from the list.')
    return
  }

  await setSession(fastify.redis, phone, 'BILLING_WEIGHT', { billingMetal: metalKey })
  await sendText(
    phone,
    `✅ *${ALL_METALS[metalKey].label}* selected.\n\n⚖️ Enter the *gross weight in grams*:\n_(e.g. 12.5)_`,
  )
}

// ── Step 3: Handle weight input → ask making charges ─────────────────────────

export async function handleBillingWeight(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'text') {
    await sendText(phone, '⚖️ Please type the weight in grams (e.g. 12.5)')
    return
  }

  const text = (message as MetaTextMessage).text.body.trim()
  const weight = parseFloat(text)

  if (isNaN(weight) || weight <= 0 || weight > 10000) {
    await sendText(phone, '❌ Please enter a valid weight between 0.1 and 10,000 grams.\n_(e.g. 12.5)_')
    return
  }

  const session = await getSession(fastify.redis, phone)
  await setSession(fastify.redis, phone, 'BILLING_MAKING', {
    ...session?.data,
    billingWeightGrams: weight,
  })

  await sendText(
    phone,
    `✅ Weight: *${weight}g*\n\n🔨 Enter *making charges per gram* in ₹:\n_(e.g. 450 — type 0 if none)_`,
  )
}

// ── Step 4: Handle making charges → ask stone cost ───────────────────────────

export async function handleBillingMaking(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'text') {
    await sendText(phone, '🔨 Please type the making charges per gram in ₹ (e.g. 450)')
    return
  }

  const text = (message as MetaTextMessage).text.body.trim()
  const making = parseFloat(text)

  if (isNaN(making) || making < 0 || making > 50000) {
    await sendText(phone, '❌ Please enter a valid amount between 0 and 50,000.\n_(e.g. 450)_')
    return
  }

  const session = await getSession(fastify.redis, phone)
  await setSession(fastify.redis, phone, 'BILLING_STONE', {
    ...session?.data,
    billingMakingPerGram: making,
  })

  await sendText(
    phone,
    `✅ Making: *₹${making}/g*\n\n💎 Enter *stone / extra charges* in ₹:\n_(e.g. 15000 — type 0 if none)_`,
  )
}

// ── Step 5: Handle stone cost → generate bill ────────────────────────────────

export async function handleBillingStone(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'text') {
    await sendText(phone, '💎 Please type the stone/extra charges in ₹ (e.g. 15000 or 0)')
    return
  }

  const text = (message as MetaTextMessage).text.body.trim()
  const stoneCost = parseFloat(text)

  if (isNaN(stoneCost) || stoneCost < 0 || stoneCost > 10_000_000) {
    await sendText(phone, '❌ Please enter a valid amount (0 or more).\n_(e.g. 15000)_')
    return
  }

  const session = await getSession(fastify.redis, phone)
  const data = session?.data
  const metalKey = data?.billingMetal
  const weight = data?.billingWeightGrams
  const makingPerGram = data?.billingMakingPerGram

  if (!metalKey || !weight || makingPerGram === undefined) {
    await sendText(phone, '⚠️ Session expired. Please start the billing calculator again from the menu.')
    await resetSession(fastify.redis, phone)
    return
  }

  // Fetch live rates
  const rates = await getMetalRates(fastify.redis)
  if (!rates) {
    await sendText(phone, '⚠️ Unable to fetch live rates right now. Please try again in a few minutes.')
    await resetSession(fastify.redis, phone)
    return
  }

  // Calculate
  const metal = ALL_METALS[metalKey]
  const isGold = metalKey.startsWith('gold_')
  const baseRate = isGold ? rates.gold_per_gram_inr : rates.silver_per_gram_inr
  const purityRate = Math.round(baseRate * metal.factor)

  const metalCost = Math.round(purityRate * weight)
  const makingTotal = Math.round(makingPerGram * weight)
  const subtotal = metalCost + makingTotal + stoneCost
  const gst = Math.round(subtotal * 0.03)
  const total = subtotal + gst

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`

  const bill = [
    `━━━━━━━━━━━━━━━━━━━━━`,
    `📋 *BILLING ESTIMATE*`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `🪙 Metal: *${metal.label}*`,
    `📈 Rate: *${fmt(purityRate)}/g*`,
    `⚖️ Weight: *${weight}g*`,
    ``,
    `┌─────────────────────`,
    `│ Metal Value:    ${fmt(metalCost)}`,
    `│ Making (${fmt(makingPerGram)}/g): ${fmt(makingTotal)}`,
    ...(stoneCost > 0 ? [`│ Stone/Extra:    ${fmt(stoneCost)}`] : []),
    `├─────────────────────`,
    `│ Subtotal:       ${fmt(subtotal)}`,
    `│ GST (3%):       ${fmt(gst)}`,
    `╞═════════════════════`,
    `│ *TOTAL:         ${fmt(total)}*`,
    `└─────────────────────`,
    ``,
    `_Rates as of ${new Date(rates.fetchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST_`,
  ].join('\n')

  await sendText(phone, bill)

  // Preserve computed values for invoice generation
  const billingResults = {
    billingStoneCost: stoneCost,
    billingMetalRate: purityRate,
    billingMetalCost: metalCost,
    billingMakingTotal: makingTotal,
    billingSubtotal: subtotal,
    billingGst: gst,
    billingTotal: total,
  }

  // If invoiceMode, skip the choice and go straight to customer name
  if (data?.invoiceMode) {
    await transitionState(fastify.redis, phone, 'INVOICE_CUSTOMER_NAME', billingResults)
    await sendText(phone, '📄 *Generate GST Invoice*\n\nEnter the *customer name*:')
    return
  }

  await transitionState(fastify.redis, phone, 'BILLING_DONE', billingResults)

  await sendButtons(phone, 'What would you like to do next?', [
    { type: 'reply', reply: { id: 'gen_invoice', title: '📄 Generate Invoice' } },
    { type: 'reply', reply: { id: 'new_calc', title: '🔄 New Calculation' } },
    { type: 'reply', reply: { id: 'back_menu', title: '🏠 Main Menu' } },
  ])
}

// ── Step 6: Handle post-billing actions ──────────────────────────────────────

export async function handleBillingDone(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'interactive') {
    await sendButtons(phone, 'Please select an option:', [
      { type: 'reply', reply: { id: 'gen_invoice', title: '📄 Generate Invoice' } },
      { type: 'reply', reply: { id: 'new_calc', title: '🔄 New Calculation' } },
      { type: 'reply', reply: { id: 'back_menu', title: '🏠 Main Menu' } },
    ])
    return
  }

  const interactive = (message as MetaInteractiveMessage).interactive
  const replyId =
    interactive?.type === 'button_reply'
      ? interactive.button_reply.id
      : ''

  if (replyId === 'gen_invoice') {
    await transitionState(fastify.redis, phone, 'INVOICE_CUSTOMER_NAME')
    await sendText(phone, '📄 *Generate GST Invoice*\n\nEnter the *customer name*:')
    return
  }

  if (replyId === 'new_calc') {
    await startBillingCalc(phone, fastify)
    return
  }

  // back_menu or anything else
  await resetSession(fastify.redis, phone)
}
