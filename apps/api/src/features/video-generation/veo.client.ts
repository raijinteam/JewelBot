import axios from 'axios'
import { env } from '../../config/env.js'
import { sleep } from '../../shared/utils.js'
import { logger } from '../../shared/logger.js'

const veoClient = axios.create({
  baseURL: env.KIE_AI_BASE_URL,
  headers: {
    Authorization: `Bearer ${env.KIE_AI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 30_000,
})

// ─── API Response Types ───────────────────────────────────────────────────────

interface VeoCreateTaskResponse {
  code: number
  msg: string
  data: {
    taskId: string
  }
}

interface VeoRecordInfoResponse {
  code: number
  msg: string
  data: {
    taskId: string
    paramJson: string
    completeTime: string
    response: {
      taskId: string
      resultUrls: string[]
      originUrls: string[]
      fullResultUrls: string[]
      resolution: string
    } | null
    successFlag: number // 1 = success
    errorCode: string | null
    errorMessage: string
    createTime: string
    fallbackFlag: boolean
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export class VideoGenerationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VideoGenerationError'
  }
}

export interface VeoJobRequest {
  prompt: string
  imageUrls: string[] // [startFrame, endFrame]
  aspectRatio: '16:9' | '9:16'
  callbackUrl?: string
}

/**
 * Submit a video generation job to Veo 3.1.
 * POST /api/v1/veo/generate
 * Returns the taskId.
 */
export async function submitVeoJob(req: VeoJobRequest): Promise<string> {
  try {
    const res = await veoClient.post<VeoCreateTaskResponse>('/api/v1/veo/generate', {
      prompt: req.prompt,
      imageUrls: req.imageUrls,
      model: 'veo3_fast',
      watermark: '',
      ...(req.callbackUrl ? { callBackUrl: req.callbackUrl } : {}),
      aspect_ratio: req.aspectRatio,
      enableFallback: false,
      enableTranslation: true,
      generationType: 'FIRST_AND_LAST_FRAMES_2_VIDEO',
    })

    if (res.data.code !== 200) {
      throw new VideoGenerationError(`Veo API rejected task: ${res.data.msg}`)
    }

    logger.info({ taskId: res.data.data.taskId }, 'Veo 3.1 task submitted')
    return res.data.data.taskId
  } catch (err) {
    if (err instanceof VideoGenerationError) throw err
    throw new VideoGenerationError(`Veo API submission failed: ${(err as Error).message}`)
  }
}

/**
 * Poll GET /api/v1/veo/record-info?taskId=... until successFlag=1 or error.
 * Veo takes ~3 minutes. We poll every 10s for up to 30 attempts (300s / 5 min max).
 * Returns the video URL.
 */
export async function pollVeoJob(
  taskId: string,
  maxAttempts = 30,
  intervalMs = 10_000,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(intervalMs)

    try {
      const res = await veoClient.get<VeoRecordInfoResponse>('/api/v1/veo/record-info', {
        params: { taskId },
      })

      if (res.data.code !== 200) {
        logger.warn({ taskId, code: res.data.code }, 'Veo recordInfo non-200, retrying')
        continue
      }

      const data = res.data.data

      logger.debug({ taskId, successFlag: data.successFlag, attempt }, 'Polling Veo 3.1')

      // Check for error
      if (data.errorCode || data.errorMessage) {
        throw new VideoGenerationError(
          `Veo task failed — code: ${data.errorCode}, msg: ${data.errorMessage || 'unknown'}`,
        )
      }

      // Check for success
      if (data.successFlag === 1 && data.response?.resultUrls?.length) {
        const videoUrl = data.response.resultUrls[0]
        logger.info({ taskId, videoUrl }, 'Veo 3.1 task completed')
        return videoUrl
      }

      // Still processing — keep polling
    } catch (err) {
      if (err instanceof VideoGenerationError) throw err
      logger.warn({ taskId, err, attempt }, 'Veo poll request error, retrying')
    }
  }

  throw new VideoGenerationError(`Veo task timed out after ${(maxAttempts * intervalMs) / 1000}s`)
}
