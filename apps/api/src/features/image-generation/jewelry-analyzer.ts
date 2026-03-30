import OpenAI from 'openai'
import { env } from '../../config/env.js'
import { ImageAnalysisError } from '../../shared/errors.js'
import type { JewelryAnalysis } from '@jewel/shared-types'

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })

const ANALYSIS_SYSTEM_PROMPT = `You are a jewelry image analysis expert.
Analyze the uploaded image and describe precisely what is visible.
Focus on the jewelry and ignore the background.

Guidelines:
"description" → Give a complete and factual visual description of the jewelry (design, materials, shapes, and details). Keep it under 80 words.
"jewel_type" → Identify if it is a ring, necklace, bracelet, bangle, pendant, earrings, nose_pin, anklet, brooch, or other.

Return JSON only, no markdown: { "description": "...", "jewel_type": "..." }`

/**
 * Analyze a jewelry image using GPT-4o Vision.
 * @param imageUrl - A publicly accessible image URL (e.g., from Cloudinary)
 */
export async function analyzeJewelryImage(imageUrl: string): Promise<JewelryAnalysis> {
  let raw: string

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content: ANALYSIS_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'high' },
            },
            {
              type: 'text',
              text: 'Analyze this jewelry image and return only JSON.',
            },
          ],
        },
      ],
    })

    raw = response.choices[0]?.message?.content ?? ''
  } catch (err) {
    throw new ImageAnalysisError(`OpenAI call failed: ${(err as Error).message}`)
  }

  // Strip any accidental markdown code fences
  const cleaned = raw.replace(/```(?:json)?/g, '').trim()

  try {
    const parsed = JSON.parse(cleaned) as JewelryAnalysis
    if (!parsed.description || !parsed.jewel_type) {
      throw new Error('Missing fields')
    }
    return parsed
  } catch {
    throw new ImageAnalysisError(`Could not parse GPT-4o response: ${raw}`)
  }
}
