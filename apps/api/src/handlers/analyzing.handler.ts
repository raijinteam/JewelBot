import type { FastifyInstance } from 'fastify'
import { sendText } from '../whatsapp/wa.messages.js'

/** Handles messages received while analysis is in progress — just reassure the user. */
export async function handleAnalyzing(phone: string, _fastify: FastifyInstance): Promise<void> {
  await sendText(phone, '⏳ Still analyzing your photo, please wait a moment...')
}
