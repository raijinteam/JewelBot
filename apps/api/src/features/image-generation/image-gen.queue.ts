import { Queue } from 'bullmq'
import { env } from '../../config/env.js'
import { QUEUES } from '../../config/constants.js'
import type { ImageGenJobPayload } from '@jewel/shared-types'

const connection = { url: env.REDIS_URL }

export const imageGenQueue = new Queue<ImageGenJobPayload>(QUEUES.IMAGE_GENERATION, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
})

export async function enqueueImageGenJob(payload: ImageGenJobPayload): Promise<string> {
  const job = await imageGenQueue.add('generate', payload, {
    jobId: payload.jobId,
  })
  return job.id!
}
