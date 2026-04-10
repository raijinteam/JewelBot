import { Worker } from 'bullmq'
import Redis from 'ioredis'
import { prisma } from '@jewel/database'
import { env } from '../../config/env.js'
import { QUEUES } from '../../config/constants.js'
import { submitKieJob, pollKieJob } from '../image-generation/kie-ai.client.js'
import { uploadFromUrl } from '../../storage/cloudinary.service.js'
import { sendImage, sendButtons } from '../../whatsapp/wa.messages.js'
import { deductCredit } from '../../billing/credits.service.js'
import { resetSession } from '../../session/session.service.js'
import { logger } from '../../shared/logger.js'
import type { FestivePostJobPayload } from '@jewel/shared-types'
import { CREDIT_COST_FESTIVE } from '../../config/constants.js'

const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })

export function startFestivePostWorker() {
  const worker = new Worker<FestivePostJobPayload>(
    QUEUES.FESTIVE_POST,
    async (job) => {
      const { jobId, userId, userPhone, logoUrl, brandName, brandPhone, festivalName, prompt } = job.data

      logger.info({ jobId, userId, festivalName }, 'Festive post job started')

      await prisma.imageJob.update({
        where: { id: jobId },
        data: { status: 'PROCESSING', bullJobId: job.id },
      })

      let resultUrl: string

      try {
        // Submit to Kie AI — logo as the input image, prompt describes the festive post
        const taskId = await submitKieJob({
          imageUrl: logoUrl,
          prompt,
          callbackUrl: `${env.APP_URL}/webhook/kie-callback`,
          aspectRatio: '4:5',
          outputFormat: 'png',
        })

        // Poll until done
        const kieResultUrl = await pollKieJob(taskId)

        // Upload to Cloudinary for permanent storage
        resultUrl = await uploadFromUrl(kieResultUrl, `jewel/festive/${userId}`)
      } catch (err) {
        const errorMsg = (err as Error).message
        logger.error({ jobId, err }, 'Festive post generation failed')

        await prisma.imageJob.update({
          where: { id: jobId },
          data: { status: 'FAILED', errorMessage: errorMsg },
        })

        await resetSession(redis, userPhone)

        await sendButtons(
          userPhone,
          '❌ Something went wrong generating your festive post. Your credits have NOT been deducted.\n\nWould you like to try again?',
          [
            { type: 'reply', reply: { id: 'festive_post', title: '🎉 Try Again' } },
            { type: 'reply', reply: { id: 'cancel', title: '❌ Cancel' } },
          ],
        )
        return
      }

      // Deduct credits
      try {
        await deductCredit(userId, CREDIT_COST_FESTIVE)
      } catch {
        logger.error({ userId, jobId }, 'Credit deduction failed after festive post generation')
      }

      // Save result
      await prisma.imageJob.update({
        where: { id: jobId },
        data: {
          status: 'DONE',
          resultImageUrl: resultUrl,
          completedAt: new Date(),
          creditsUsed: CREDIT_COST_FESTIVE,
        },
      })

      // Deliver result — image only, no caption, so it can be forwarded directly
      await sendImage(userPhone, resultUrl)

      await resetSession(redis, userPhone)

      logger.info({ jobId, userId, festivalName, resultUrl }, 'Festive post job completed')
    },
    {
      connection: { url: env.REDIS_URL },
      concurrency: 2,
    },
  )

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Festive post BullMQ job permanently failed')
  })

  logger.info('Festive post worker started')
  return worker
}
