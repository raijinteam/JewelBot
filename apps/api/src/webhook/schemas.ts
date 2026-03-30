import { z } from 'zod'

export const metaVerifyQuerySchema = z.object({
  'hub.mode': z.string(),
  'hub.verify_token': z.string(),
  'hub.challenge': z.string(),
})

export type MetaVerifyQuery = z.infer<typeof metaVerifyQuerySchema>
