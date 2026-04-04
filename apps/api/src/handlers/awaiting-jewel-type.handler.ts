import type { FastifyInstance } from 'fastify'
import type { MetaMessage, MetaInteractiveMessage } from '../whatsapp/wa.types.js'
import { sendList, sendText } from '../whatsapp/wa.messages.js'
import { setSession } from '../session/session.service.js'
import { findOrCreateUser } from '../users/user.service.js'
import { hasCredits } from '../billing/credits.service.js'
import { CREDIT_COST_PHOTO } from '../config/constants.js'

const JEWEL_TYPE_MAP: Record<string, { type: string; label: string }> = {
  jtype_set: { type: 'jewelry_set', label: 'Jewelry Set' },
  jtype_ring: { type: 'ring', label: 'Ring' },
  jtype_necklace: { type: 'necklace', label: 'Necklace / Pendant' },
  jtype_earrings: { type: 'earrings', label: 'Earrings' },
  jtype_bracelet: { type: 'bracelet', label: 'Bracelet' },
  jtype_bangle: { type: 'bangle', label: 'Bangle / Kada' },
}

export async function showJewelTypeMenu(
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  const user = await findOrCreateUser(phone)

  if (!(await hasCredits(user.id, CREDIT_COST_PHOTO))) {
    await sendText(
      phone,
      `You need at least *${CREDIT_COST_PHOTO} credits* to generate a photo but you don't have enough 😔\n\nType *menu* and tap *⬆️ Plans & Credits* to get more.`,
    )
    return
  }

  await setSession(fastify.redis, phone, 'AWAITING_JEWEL_TYPE', {})

  await sendList(
    phone,
    '📸 *Create Photo*\n\nWhat type of jewelry are you uploading?\n\n_Each photo costs 5 credits._',
    '💍 Select Type',
    [
      {
        title: 'Jewelry Type',
        rows: [
          { id: 'jtype_set', title: '💎 Jewelry Set', description: 'Necklace + Earring combo' },
          { id: 'jtype_ring', title: '💍 Ring', description: 'Finger rings' },
          { id: 'jtype_necklace', title: '📿 Necklace / Pendant', description: 'Necklaces, pendants, chains' },
          { id: 'jtype_earrings', title: '✨ Earrings', description: 'Studs, drops, jhumkas' },
          { id: 'jtype_bracelet', title: '⌚ Bracelet', description: 'Chain bracelets, charm bracelets' },
          { id: 'jtype_bangle', title: '⭕ Bangle / Kada', description: 'Bangles, kadas' },
        ],
      },
    ],
    '💍 Choose Jewelry Type',
  )
}

export async function handleAwaitingJewelType(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'interactive') {
    await showJewelTypeMenu(phone, fastify)
    return
  }

  const interactive = (message as MetaInteractiveMessage).interactive
  const replyId =
    interactive?.type === 'list_reply'
      ? interactive.list_reply.id
      : interactive?.type === 'button_reply'
        ? interactive.button_reply.id
        : ''

  const selected = JEWEL_TYPE_MAP[replyId]
  if (!selected) {
    await showJewelTypeMenu(phone, fastify)
    return
  }

  await setSession(fastify.redis, phone, 'AWAITING_IMAGE', {
    jewellType: selected.type,
  })

  await sendText(phone, `📸 Send me a clear photo of your *${selected.label}*.`)
}
