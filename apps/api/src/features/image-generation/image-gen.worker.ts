import { Worker } from 'bullmq'
import Redis from 'ioredis'
import { prisma } from '@jewel/database'
import { env } from '../../config/env.js'
import { QUEUES } from '../../config/constants.js'
import { submitKieJob, pollKieJob } from './kie-ai.client.js'
import { uploadFromUrl } from '../../storage/cloudinary.service.js'
import { sendImage, sendButtons, sendText } from '../../whatsapp/wa.messages.js'
import { deductCredit } from '../../billing/credits.service.js'
import { resetSession } from '../../session/session.service.js'
import { logger } from '../../shared/logger.js'
import type { ImageGenJobPayload } from '@jewel/shared-types'

const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })

export function startImageGenWorker() {
  const worker = new Worker<ImageGenJobPayload>(
    QUEUES.IMAGE_GENERATION,
    async (job) => {
      const { jobId, userId, userPhone, sourceImageUrl, templateId, jewellType, jewellDescription, aspectRatio } =
        job.data

      logger.info({ jobId, userId }, 'Image gen job started')

      // Mark job as PROCESSING in DB
      await prisma.imageJob.update({
        where: { id: jobId },
        data: { status: 'PROCESSING', bullJobId: job.id },
      })

      // Fetch template
      const template = await prisma.template.findUniqueOrThrow({ where: { id: templateId } })

      let resultUrl: string

      try {
        // Submit to Kie AI with callback URL so it notifies us on completion
        const taskId = await submitKieJob({
          imageUrl: sourceImageUrl,
          prompt: template.basePrompt,
          callbackUrl: `${env.APP_URL}/webhook/kie-callback`,
          aspectRatio: aspectRatio ?? '1:1',
          resolution: '1K',
          outputFormat: 'jpg',
        })

        // Poll until done (callback is best-effort; polling is the reliable path)
        const kieResultUrl = await pollKieJob(taskId)

        // Upload to Cloudinary for permanent storage
        resultUrl = await uploadFromUrl(kieResultUrl, `jewel/generated/${userId}`)
      } catch (err) {
        const errorMsg = (err as Error).message
        logger.error({ jobId, err }, 'Image generation failed')

        await prisma.imageJob.update({
          where: { id: jobId },
          data: { status: 'FAILED', errorMessage: errorMsg },
        })

        // Reset session so user isn't stuck in PROCESSING
        await resetSession(redis, userPhone)

        // Notify user — credit NOT deducted on failure
        await sendButtons(
          userPhone,
          'Something went wrong generating your image. Your credit has NOT been deducted.\n\nWould you like to try again?',
          [
            { type: 'reply', reply: { id: 'start_photo', title: '📸 Try Again' } },
            { type: 'reply', reply: { id: 'cancel', title: '❌ Cancel' } },
          ],
        )
        return
      }

      // Deduct credit atomically
      try {
        await deductCredit(userId)
      } catch {
        // Credit deduction failed — still deliver the image but log it
        logger.error({ userId, jobId }, 'Credit deduction failed after successful generation')
      }

      // Save result in DB
      await prisma.imageJob.update({
        where: { id: jobId },
        data: {
          status: 'DONE',
          resultImageUrl: resultUrl,
          completedAt: new Date(),
          creditsUsed: 1,
        },
      })

      // Deliver result to user
      await sendImage(
        userPhone,
        resultUrl,
        `✨ Your *${template.name}* photo is ready!`,
      )

      // Reset session so user can start fresh
      await resetSession(redis, userPhone)

      await sendButtons(
        userPhone,
        'What would you like to do next?',
        [
          { type: 'reply', reply: { id: 'start_photo', title: '📸 Create Photo' } },
          { type: 'reply', reply: { id: 'view_credits', title: '💳 My Credits' } },
          { type: 'reply', reply: { id: 'help', title: '❓ Help' } },
        ],
      )

      logger.info({ jobId, userId, resultUrl }, 'Image gen job completed')
    },
    {
      connection: { url: env.REDIS_URL },
      concurrency: 3,
    },
  )

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'BullMQ job permanently failed')
  })

  logger.info('Image generation worker started')
  return worker
}
