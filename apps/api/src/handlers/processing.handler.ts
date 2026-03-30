import type { FastifyInstance } from 'fastify'
import { sendText } from '../whatsapp/wa.messages.js'

/** User sends a message while their image is being generated — just reassure them. */
export async function handleProcessing(phone: string, _fastify: FastifyInstance): Promise<void> {
  await sendText(phone, '⏳ Your photo is still being processed. I\'ll send it shortly!')
}
