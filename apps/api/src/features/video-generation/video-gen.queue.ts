import { Queue } from 'bullmq'
import { env } from '../../config/env.js'
import { QUEUES } from '../../config/constants.js'
import type { VideoGenJobPayload } from '@jewel/shared-types'

const connection = { url: env.REDIS_URL }

export const videoGenQueue = new Queue<VideoGenJobPayload>(QUEUES.VIDEO_GENERATION, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 50 },
  },
})

export async function enqueueVideoGenJob(payload: VideoGenJobPayload): Promise<string> {
  const job = await videoGenQueue.add('generate-video', payload, {
    jobId: payload.jobId,
  })
  return job.id!
}
