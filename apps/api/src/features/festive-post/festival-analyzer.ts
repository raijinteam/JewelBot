import OpenAI from 'openai'
import { env } from '../../config/env.js'
import { logger } from '../../shared/logger.js'

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })

/**
 * Build the system prompt dynamically based on which branding fields are provided.
 */
function buildSystemPrompt(hasLogo: boolean, hasName: boolean, hasPhone: boolean): string {
  const brandingParts: string[] = []
  if (hasLogo) {
    brandingParts.push('- Place the company logo EXACTLY ONCE in the design — do NOT add multiple logos or duplicate it')
    brandingParts.push('- The logo must be placed naturally and seamlessly integrated into the post design, not just stuck flat at the top or corner')
    brandingParts.push('- The logo image provided is the EXACT logo to use — preserve ALL text, words, and graphics within the logo exactly as they are, do not remove or alter anything from the logo')
  }
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
  if (hasLogo) {
    brandingInstructions.push('the company logo placed EXACTLY ONCE, naturally integrated into the design (not just pasted flat at the top)')
    brandingInstructions.push('the logo must be kept COMPLETELY INTACT — all text, words, and graphics within the logo must be preserved exactly as provided, nothing removed or altered')
  }
  if (hasName) brandingInstructions.push(`the company name "${brandName}" integrated into the design`)
  if (hasPhone) brandingInstructions.push(`the phone number "${brandPhone}" integrated into the design`)

  const instructionText = brandingInstructions.length > 0
    ? `The image should have ${brandingInstructions.join('. Also ')} in a stylish way.`
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
    if (hasLogo) extras.push('the provided logo image must appear EXACTLY ONCE — do NOT duplicate or add any other logos. The logo must be kept completely intact with all its original text and graphics preserved. Place it naturally integrated into the design, not just flat-pasted at the top')
    if (hasName) extras.push(`the text "${brandName}" as the business name`)
    if (hasPhone) extras.push(`"${brandPhone}" as contact number`)

    let fullPrompt = parsed.prompt
    if (extras.length > 0) {
      fullPrompt += `. CRITICAL RULES: ${extras.join('. ')}.`
    }
    fullPrompt += ' The design should be vibrant, eye-catching, and suitable for WhatsApp/Instagram sharing.'

    logger.info({ festivalName, greeting: parsed.greeting }, 'Festival prompt generated')
    return fullPrompt
  } catch {
    // Fallback prompt if parsing fails
    logger.warn({ festivalName, raw }, 'Failed to parse festival analysis, using fallback')

    const fallbackParts: string[] = []
    if (hasLogo) fallbackParts.push('Place the provided company logo EXACTLY ONCE, naturally integrated into the design. Keep the logo completely intact — do not remove or alter any text or graphics within the logo.')
    if (hasName) fallbackParts.push(`Include the business name "${brandName}" prominently in a stylish design.`)
    if (hasPhone) fallbackParts.push(`Include the phone number "${brandPhone}" in the design.`)
    const brandingText = fallbackParts.length > 0 ? ` ${fallbackParts.join(' ')}` : ''

    return `Create a vibrant, attractive festive greeting post for ${festivalName}. The post should be colorful, culturally appropriate, and professional.${brandingText} The post should be suitable for social media sharing with a jewelry business aesthetic. Include festive decorations, warm colors, and celebratory elements related to ${festivalName}.`
  }
}
