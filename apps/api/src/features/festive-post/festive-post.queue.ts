import { Queue } from 'bullmq'
import { env } from '../../config/env.js'
import { QUEUES } from '../../config/constants.js'
import type { FestivePostJobPayload } from '@jewel/shared-types'

const connection = { url: env.REDIS_URL }

export const festivePostQueue = new Queue<FestivePostJobPayload>(QUEUES.FESTIVE_POST, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
})

export async function enqueueFestivePostJob(payload: FestivePostJobPayload): Promise<string> {
  const job = await festivePostQueue.add('festive-generate', payload, {
    jobId: payload.jobId,
  })
  return job.id!
}
