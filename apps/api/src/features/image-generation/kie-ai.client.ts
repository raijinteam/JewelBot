import axios from 'axios'
import { env } from '../../config/env.js'
import { ImageGenerationError } from '../../shared/errors.js'
import { sleep } from '../../shared/utils.js'
import { logger } from '../../shared/logger.js'

const kieClient = axios.create({
  baseURL: env.KIE_AI_BASE_URL,
  headers: {
    Authorization: `Bearer ${env.KIE_AI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 30_000,
})

// ─── API Response Types ───────────────────────────────────────────────────────

interface KieCreateTaskResponse {
  code: number
  message: string
  data: {
    taskId: string
  }
}

interface KieRecordInfoResponse {
  code: number
  message: string
  data: {
    taskId: string
    model: string
    state: 'pending' | 'processing' | 'success' | 'failed'
    param: string
    resultJson: string // JSON string: { "resultUrls": ["https://..."] }
    failCode: string
    failMsg: string
    costTime: number
    completeTime: number
    createTime: number
  }
}

interface KieResultJson {
  resultUrls: string[]
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface KieJobRequest {
  imageUrl: string
  prompt: string
  callbackUrl?: string
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '4:5' | '5:4' | 'auto'
  resolution?: '1K' | '2K' | '4K'
  outputFormat?: 'jpg' | 'png'
}

/**
 * Submit a generation job to Kie AI (NanoBanana 2).
 * POST /api/v1/jobs/createTask
 * Returns the taskId.
 */
export async function submitKieJob(req: KieJobRequest): Promise<string> {
  try {
    const res = await kieClient.post<KieCreateTaskResponse>('/api/v1/jobs/createTask', {
      model: 'nano-banana-2',
      ...(req.callbackUrl ? { callBackUrl: req.callbackUrl } : {}),
      input: {
        prompt: req.prompt,
        image_input: [req.imageUrl],
        aspect_ratio: req.aspectRatio ?? '1:1',
        google_search: false,
        resolution: req.resolution ?? '1K',
        output_format: req.outputFormat ?? 'jpg',
      },
    })

    if (res.data.code !== 200) {
      throw new ImageGenerationError(`Kie AI rejected task: ${res.data.message}`)
    }

    logger.info({ taskId: res.data.data.taskId }, 'Kie AI task submitted')
    return res.data.data.taskId
  } catch (err) {
    if (err instanceof ImageGenerationError) throw err
    throw new ImageGenerationError(`Kie AI submission failed: ${(err as Error).message}`)
  }
}

/**
 * Poll GET /api/v1/jobs/recordInfo?taskId=... until state is "success" or "failed".
 * Kie AI takes ~15–30s. We poll every 4s for up to 50 attempts (200s max).
 * Returns the generated image URL.
 */
export async function pollKieJob(
  taskId: string,
  maxAttempts = 50,
  intervalMs = 4_000,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(intervalMs)

    let data: KieRecordInfoResponse['data']

    try {
      const res = await kieClient.get<KieRecordInfoResponse>('/api/v1/jobs/recordInfo', {
        params: { taskId },
      })

      if (res.data.code !== 200) {
        logger.warn({ taskId, code: res.data.code }, 'Kie AI recordInfo non-200, retrying')
        continue
      }

      data = res.data.data
    } catch (err) {
      logger.warn({ taskId, err, attempt }, 'Kie AI poll request error, retrying')
      continue
    }

    logger.debug({ taskId, state: data.state, attempt }, 'Polling Kie AI')

    if (data.state === 'success') {
      return extractResultUrl(taskId, data.resultJson)
    }

    if (data.state === 'failed') {
      throw new ImageGenerationError(
        `Kie AI task failed — code: ${data.failCode}, msg: ${data.failMsg || 'unknown'}`,
      )
    }

    // state is 'pending' or 'processing' — keep polling
  }

  throw new ImageGenerationError(`Kie AI task timed out after ${maxAttempts * intervalMs / 1000}s`)
}

/**
 * Parse resultJson (a JSON string) and return the first result URL.
 * resultJson shape: '{"resultUrls":["https://..."]}'
 */
function extractResultUrl(taskId: string, resultJson: string): string {
  try {
    const parsed = JSON.parse(resultJson) as KieResultJson
    const url = parsed.resultUrls?.[0]
    if (!url) throw new Error('Empty resultUrls')
    return url
  } catch (err) {
    throw new ImageGenerationError(
      `Could not parse Kie AI resultJson for task ${taskId}: ${(err as Error).message}`,
    )
  }
}
