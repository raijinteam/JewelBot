import { Worker } from 'bullmq'
import Redis from 'ioredis'
import { prisma } from '@jewel/database'
import { env } from '../../config/env.js'
import { QUEUES, CREDIT_COST_VIDEO } from '../../config/constants.js'
import { submitNanoBanana2Job, pollKieJob } from '../image-generation/kie-ai.client.js'
import { submitVeoJob, pollVeoJob } from './veo.client.js'
import { uploadVideoFromUrl } from '../../storage/cloudinary.service.js'
import { sendText, sendVideo } from '../../whatsapp/wa.messages.js'
import { deductCredit } from '../../billing/credits.service.js'
import { resetSession } from '../../session/session.service.js'
import { getVideoSubTemplate } from './video-templates.js'
import { logger } from '../../shared/logger.js'
import type { VideoGenJobPayload } from '@jewel/shared-types'

const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })

export function startVideoGenWorker() {
  const worker = new Worker<VideoGenJobPayload>(
    QUEUES.VIDEO_GENERATION,
    async (job) => {
      const {
        jobId, userId, userPhone, sourceImageUrl,
        logoUrl, templateId, subTemplateId, aspectRatio,
      } = job.data

      const subTemplate = getVideoSubTemplate(templateId, subTemplateId)
      if (!subTemplate) {
        throw new Error(`Sub-template not found: ${templateId}/${subTemplateId}`)
      }

      let videoUrl: string

      try {
        // ── Step 1: Generate Frame 0 with NanoBanana 2 ─────────────────────
        const frame0Input = subTemplate.frame0UsesLogo && logoUrl
          ? [logoUrl]
          : [sourceImageUrl]

        logger.info({ jobId, step: 'frame0' }, 'Generating Frame 0')

        const frame0TaskId = await submitNanoBanana2Job({
          imageUrls: frame0Input,
          prompt: subTemplate.frame0Prompt,
          aspectRatio,
        })

        const frame0Url = await pollKieJob(frame0TaskId, 15, 4_000) // ~60s max
        logger.info({ jobId, frame0Url }, 'Frame 0 generated')

        // ── Step 2: Generate Last Frame with NanoBanana 2 ──────────────────
        // Use Frame 0 + jewelry image as references
        logger.info({ jobId, step: 'frame1' }, 'Generating Last Frame')

        const frame1TaskId = await submitNanoBanana2Job({
          imageUrls: [frame0Url, sourceImageUrl],
          prompt: subTemplate.frame1Prompt,
          aspectRatio,
        })

        const frame1Url = await pollKieJob(frame1TaskId, 15, 4_000) // ~60s max
        logger.info({ jobId, frame1Url }, 'Last Frame generated')

        // ── Step 3: Generate video with Veo 3.1 ───────────────────────────
        logger.info({ jobId, step: 'video' }, 'Generating video with Veo 3.1')

        const veoTaskId = await submitVeoJob({
          prompt: subTemplate.videoPrompt,
          imageUrls: [frame0Url, frame1Url],
          aspectRatio,
        })

        const rawVideoUrl = await pollVeoJob(veoTaskId, 36, 10_000) // ~6 min max
        logger.info({ jobId, rawVideoUrl }, 'Video generated')

        // ── Step 4: Upload video to Cloudinary ─────────────────────────────
        videoUrl = await uploadVideoFromUrl(rawVideoUrl, `jewel/videos/${userId}`)
        logger.info({ jobId, videoUrl }, 'Video uploaded to Cloudinary')

        // ── Step 5: Deduct credits ─────────────────────────────────────────
        await deductCredit(userId, CREDIT_COST_VIDEO)

        // ── Step 6: Update DB ──────────────────────────────────────────────
        await prisma.imageJob.update({
          where: { id: jobId },
          data: {
            status: 'DONE',
            resultImageUrl: videoUrl,
            creditsUsed: CREDIT_COST_VIDEO,
          },
        })

        // ── Step 7: Send video to user ─────────────────────────────────────
        await sendVideo(userPhone, videoUrl)
        await resetSession(redis, userPhone)

        logger.info({ jobId, userId }, 'Video generation complete')
      } catch (err) {
        logger.error({ err, jobId }, 'Video generation failed')

        await prisma.imageJob.update({
          where: { id: jobId },
          data: { status: 'FAILED' },
        }).catch(() => {})

        await sendText(userPhone, '❌ Video generation failed. Please try again.')
        await resetSession(redis, userPhone)

        throw err
      }
    },
    {
      connection: redis as any,
      concurrency: 2,
    },
  )

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Video gen worker job failed')
  })

  logger.info('Video generation worker started')
  return worker
}
