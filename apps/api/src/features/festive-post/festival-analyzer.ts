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
    brandingParts.push('- The provided logo image must appear EXACTLY ONCE — never duplicate it')
    brandingParts.push('- The logo must BLEND naturally into the scene as if it belongs there (e.g. on a banner, flag, signboard, frame, or decorative element) — NOT flat-pasted or floating on top')
    brandingParts.push('- Preserve ALL text, words, and graphics within the logo exactly as they are')
  }
  if (hasName) brandingParts.push('- Include the company name in a stylish, integrated way')
  if (hasPhone) brandingParts.push('- Include the phone number in a stylish, integrated way')

  const brandingSection = brandingParts.length > 0
    ? `\n${brandingParts.join('\n')}`
    : ''

  return `You are a festival marketing expert for Indian jewelry businesses.
Given a festival or occasion name, create a detailed image generation prompt for a vibrant, attractive festive greeting/promotional post.

The post MUST:
- Include a prominent, clearly readable festive greeting text like "Happy Diwali", "Shubh Navratri", "Happy Hanuman Jayanti", "Eid Mubarak" etc. — this is MANDATORY so viewers immediately understand the occasion
- Be visually stunning and culturally appropriate for the festival
- Include festive elements, colors, and symbols relevant to the occasion
- Have a professional jewelry business marketing feel
- Be designed for social media (Instagram/WhatsApp) at 4:5 aspect ratio${brandingSection}

Return JSON only, no markdown:
{
  "prompt": "detailed image generation prompt here...",
  "greeting": "the festive greeting text to display (e.g. Happy Diwali, Eid Mubarak, Shubh Navratri)"
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
    brandingInstructions.push('the company logo blended naturally into the scene (on a banner, signboard, decorative frame, or similar element — NOT flat-pasted or floating)')
    brandingInstructions.push('the logo must appear EXACTLY ONCE and be kept COMPLETELY INTACT with all its original text and graphics')
  }
  if (hasName) brandingInstructions.push(`the company name "${brandName}" integrated into the design`)
  if (hasPhone) brandingInstructions.push(`the phone number "${brandPhone}" integrated into the design`)

  const instructionText = brandingInstructions.length > 0
    ? `The image should have ${brandingInstructions.join('. Also ')}.`
    : 'The image should be a standalone festive greeting suitable for sharing.'

  userParts.push('')
  userParts.push(`Generate a detailed prompt for creating a festive promotional image. The image MUST include a prominent, clearly readable festive greeting text appropriate for ${festivalName} (e.g. "Happy ${festivalName}" or similar). ${instructionText}`)

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

    const greeting = parsed.greeting || `Happy ${festivalName}`

    // Enhance the prompt with explicit instructions
    const extras: string[] = []

    // Always require greeting text
    extras.push(`MUST include the text "${greeting}" prominently and clearly readable in the image as a festive greeting`)

    if (hasLogo) extras.push('the provided logo image must appear EXACTLY ONCE — do NOT duplicate. The logo must BLEND into the scene naturally (placed on a banner, signboard, decorative frame, or similar in-scene element) — it should look like part of the artwork, NOT flat-pasted or floating on top. Keep all logo text and graphics completely intact')
    if (hasName) extras.push(`the text "${brandName}" as the business name`)
    if (hasPhone) extras.push(`"${brandPhone}" as contact number`)

    let fullPrompt = parsed.prompt
    fullPrompt += `. CRITICAL RULES: ${extras.join('. ')}.`
    fullPrompt += ' The design should be vibrant, eye-catching, and suitable for WhatsApp/Instagram sharing.'

    logger.info({ festivalName, greeting }, 'Festival prompt generated')
    return fullPrompt
  } catch {
    // Fallback prompt if parsing fails
    logger.warn({ festivalName, raw }, 'Failed to parse festival analysis, using fallback')

    const fallbackParts: string[] = [`Include the text "Happy ${festivalName}" prominently and clearly readable.`]
    if (hasLogo) fallbackParts.push('Place the provided company logo EXACTLY ONCE, blended naturally into the scene (on a banner, frame, or signboard — not flat-pasted). Keep the logo completely intact.')
    if (hasName) fallbackParts.push(`Include the business name "${brandName}" prominently.`)
    if (hasPhone) fallbackParts.push(`Include the phone number "${brandPhone}" in the design.`)

    return `Create a vibrant, attractive festive greeting post for ${festivalName}. ${fallbackParts.join(' ')} The post should be colorful, culturally appropriate, and professional with a jewelry business aesthetic. Include festive decorations, warm colors, and celebratory elements related to ${festivalName}.`
  }
}
