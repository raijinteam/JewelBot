import OpenAI from 'openai'
import { env } from '../../config/env.js'
import { logger } from '../../shared/logger.js'

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })

/**
 * Build the system prompt dynamically based on which branding fields are provided.
 */
function buildSystemPrompt(hasLogo: boolean, hasName: boolean, hasPhone: boolean): string {
  const brandingParts: string[] = []
  if (hasLogo) brandingParts.push('- Include space for a company logo (top or bottom area)')
  if (hasName) brandingParts.push('- Include the company name in a stylish, integrated way')
  if (hasPhone) brandingParts.push('- Include the phone number in a stylish, integrated way')

  const brandingSection = brandingParts.length > 0
    ? `\n${brandingParts.join('\n')}`
    : ''

  return `You are a festival marketing expert for Indian jewelry businesses.
Given a festival or occasion name, create a detailed image generation prompt for a vibrant, attractive festive greeting/promotional post.

The post must:
- Be visually stunning and culturally appropriate for the festival
- Include festive elements, colors, and symbols relevant to the occasion
- Have a professional jewelry business marketing feel
- Be designed for social media (Instagram/WhatsApp) at 4:5 aspect ratio${brandingSection}

Return JSON only, no markdown:
{
  "prompt": "detailed image generation prompt here...",
  "greeting": "short festive greeting text (e.g. Happy Diwali, Eid Mubarak)"
}`
}

/**
 * Use GPT-4o to analyze a festival and generate a Kie AI prompt.
 * Only includes branding elements that are actually provided.
 */
export async function analyzeFestival(
  festivalName: string,
  brandName: string,
  brandPhone: string,
  hasLogo: boolean,
): Promise<string> {
  const hasName = !!brandName
  const hasPhone = !!brandPhone

  // Build the user message dynamically
  const userParts: string[] = [`Festival: ${festivalName}`]
  if (hasName) userParts.push(`Company Name: ${brandName}`)
  if (hasPhone) userParts.push(`Phone: ${brandPhone}`)

  const brandingInstructions: string[] = []
  if (hasLogo) brandingInstructions.push('the company logo prominently placed')
  if (hasName) brandingInstructions.push(`the company name "${brandName}" integrated into the design`)
  if (hasPhone) brandingInstructions.push(`the phone number "${brandPhone}" integrated into the design`)

  const instructionText = brandingInstructions.length > 0
    ? `The image should have ${brandingInstructions.join(', ')} in a stylish way.`
    : 'The image should be a standalone festive greeting suitable for sharing.'

  userParts.push('')
  userParts.push(`Generate a detailed prompt for creating a festive promotional image. ${instructionText}`)

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 500,
    messages: [
      { role: 'system', content: buildSystemPrompt(hasLogo, hasName, hasPhone) },
      { role: 'user', content: userParts.join('\n') },
    ],
  })

  const raw = response.choices[0]?.message?.content ?? ''
  const cleaned = raw.replace(/```(?:json)?/g, '').trim()

  try {
    const parsed = JSON.parse(cleaned) as { prompt: string; greeting: string }
    if (!parsed.prompt) throw new Error('Missing prompt')

    // Enhance the prompt with explicit branding instructions only for provided fields
    const extras: string[] = []
    if (hasName) extras.push(`the text "${brandName}" as the business name`)
    if (hasPhone) extras.push(`"${brandPhone}" as contact number`)

    let fullPrompt = parsed.prompt
    if (extras.length > 0) {
      fullPrompt += `. IMPORTANT: The image MUST include ${extras.join(' and ')}, placed strategically to look attractive and professional.`
    }
    fullPrompt += ' The design should be vibrant, eye-catching, and suitable for WhatsApp/Instagram sharing.'

    logger.info({ festivalName, greeting: parsed.greeting }, 'Festival prompt generated')
    return fullPrompt
  } catch {
    // Fallback prompt if parsing fails
    logger.warn({ festivalName, raw }, 'Failed to parse festival analysis, using fallback')

    const fallbackBranding: string[] = []
    if (hasName) fallbackBranding.push(`the business name "${brandName}"`)
    if (hasPhone) fallbackBranding.push(`phone number "${brandPhone}"`)
    const brandingText = fallbackBranding.length > 0
      ? ` Include ${fallbackBranding.join(' and ')} prominently in a stylish design.`
      : ''

    return `Create a vibrant, attractive festive greeting post for ${festivalName}. The post should be colorful, culturally appropriate, and professional.${brandingText} The post should be suitable for social media sharing with a jewelry business aesthetic. Include festive decorations, warm colors, and celebratory elements related to ${festivalName}.`
  }
}
