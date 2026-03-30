import type { FastifyInstance } from 'fastify'
import type { MetaInteractiveMessage } from '../whatsapp/wa.types.js'
import { sendButtons, sendText } from '../whatsapp/wa.messages.js'
import { getSession, transitionState, resetSession } from '../session/session.service.js'
import { getTemplateById } from '../features/image-generation/templates.service.js'

export async function handleAwaitingAspectRatio(
  message: MetaInteractiveMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  const interactive = message.interactive
  if (interactive.type !== 'button_reply') return

  const buttonId = interactive.button_reply.id

  if (buttonId === 'cancel') {
    await resetSession(fastify.redis, phone)
    await sendText(phone, "Cancelled. Send me a photo anytime to start again! 😊")
    return
  }

  const aspectRatio = buttonId === 'ratio_9_16' ? '9:16' as const : '1:1' as const

  const session = await getSession(fastify.redis, phone)
  const data = session?.data ?? {}
  const templateId = data.selectedTemplateId

  if (!templateId) {
    await sendText(phone, "Something went wrong. Please start over by sending your photo again.")
    await resetSession(fastify.redis, phone)
    return
  }

  const template = await getTemplateById(templateId)
  if (!template) {
    await sendText(phone, "Template not found. Please start over.")
    await resetSession(fastify.redis, phone)
    return
  }

  await transitionState(fastify.redis, phone, 'AWAITING_CONFIRMATION', {
    aspectRatio,
  })

  const ratioLabel = aspectRatio === '1:1' ? 'Square (1:1)' : 'Portrait (9:16)'

  await sendButtons(
    phone,
    `*${template.name}*\n_${template.category}_\nAspect ratio: *${ratioLabel}*\n\nReady to generate your professional photo?`,
    [
      { type: 'reply', reply: { id: `confirm_generate:${templateId}`, title: '✅ Yes, Generate!' } },
      { type: 'reply', reply: { id: 'choose_different', title: '🔄 Different Style' } },
      { type: 'reply', reply: { id: 'cancel', title: '❌ Cancel' } },
    ],
  )
}
