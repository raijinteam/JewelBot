import type { FastifyInstance } from 'fastify'
import { sendText } from '../whatsapp/wa.messages.js'
import { getMetalRates, GOLD_PURITY, SILVER_PURITY } from '../features/price-calculator/metals-rate.service.js'

/** Fetch live rates and show them instantly — no multi-step flow */
export async function showLiveRates(phone: string, fastify: FastifyInstance): Promise<void> {
  const rates = await getMetalRates(fastify.redis)

  if (!rates) {
    await sendText(phone, '⚠️ Unable to fetch live metal rates right now. Please try again in a few minutes.')
    return
  }

  const goldLines = Object.values(GOLD_PURITY).map(
    (m) => `  ${m.label}: *₹${Math.round(rates.gold_per_gram_inr * m.factor).toLocaleString('en-IN')}*/g`,
  )

  const silverLines = Object.values(SILVER_PURITY).map(
    (m) => `  ${m.label}: *₹${Math.round(rates.silver_per_gram_inr * m.factor).toLocaleString('en-IN')}*/g`,
  )

  const time = new Date(rates.fetchedAt).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  })

  const card = [
    `━━━━━━━━━━━━━━━━━━━━━`,
    `💰 *LIVE METAL RATES*`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `🥇 *Gold*`,
    ...goldLines,
    ``,
    `🥈 *Silver*`,
    ...silverLines,
    ``,
    `_Updated: ${time} IST_`,
    `_Approx. Indian retail rates (incl. duties)_`,
  ].join('\n')

  await sendText(phone, card)
}
