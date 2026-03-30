import type { FastifyInstance } from 'fastify'
import type { MetaInteractiveMessage } from '../whatsapp/wa.types.js'
import type { Template } from '@jewel/database'
import { sendList, sendImage, sendButtons } from '../whatsapp/wa.messages.js'
import { getSession, transitionState } from '../session/session.service.js'
import { getTemplateById } from '../features/image-generation/templates.service.js'

/** Build and send the template gallery as a WhatsApp List Message */
export async function sendTemplateGallery(
  phone: string,
  jewellType: string,
  jewellDescription: string,
  templates: Template[],
): Promise<void> {
  // Group templates by category
  const grouped = new Map<string, Template[]>()
  for (const tpl of templates) {
    const cat = tpl.category
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push(tpl)
  }

  // WhatsApp list supports max 10 rows total. Truncate if needed.
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
    `✨ I detected: *${jewellType}*\n\n_"${jewellDescription.slice(0, 120)}"_\n\nChoose a style to apply:`,
    'Select Template',
    sections,
    '🎨 Choose Your Photo Style',
    `${templates.length} templates available`,
  )
}

/** Handle template selection from the list reply */
export async function handleAwaitingTemplate(
  message: MetaInteractiveMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  const interactive = message.interactive

  // Only handle list_reply
  if (interactive.type !== 'list_reply') return

  const templateId = interactive.list_reply.id
  const template = await getTemplateById(templateId)

  if (!template) {
    return
  }

  // Update session with selected template
  await transitionState(fastify.redis, phone, 'AWAITING_ASPECT_RATIO', {
    selectedTemplateId: templateId,
  })

  // Show preview + ask for aspect ratio
  await sendImage(phone, template.previewUrl, `Preview: *${template.name}*`)

  await sendButtons(
    phone,
    `*${template.name}*\n_${template.category}_\n\nChoose the aspect ratio for your photo:`,
    [
      { type: 'reply', reply: { id: 'ratio_1_1', title: '⬜ Square (1:1)' } },
      { type: 'reply', reply: { id: 'ratio_9_16', title: '📱 Portrait (9:16)' } },
      { type: 'reply', reply: { id: 'cancel', title: '❌ Cancel' } },
    ],
  )
}
