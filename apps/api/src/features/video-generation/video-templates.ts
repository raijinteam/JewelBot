// ─── Video Template Types ────────────────────────────────────────────────────

export interface VideoSubTemplate {
  id: string
  name: string
  previewUrl: string
  frame0Prompt: string
  frame1Prompt: string
  videoPrompt: string
  frame0UsesLogo: boolean  // whether Frame 0 uses brand logo as input
}

export interface VideoTemplate {
  id: string
  name: string
  category: string
  previewUrl: string
  subTemplates: VideoSubTemplate[]
}

// ─── Template Definitions ────────────────────────────────────────────────────

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  {
    id: 'vtpl_box_reveal',
    name: 'Box Reveal',
    category: 'Reveal',
    previewUrl: 'https://res.cloudinary.com/dhbq4ad3t/image/upload/v1776250157/box_celestial_prev_oyuwpq.png',
    subTemplates: [
      {
        id: 'vsub_celestial',
        name: 'Celestial Reveal',
        previewUrl: 'https://res.cloudinary.com/dhbq4ad3t/image/upload/v1776250157/box_celestial_prev_oyuwpq.png',
        frame0UsesLogo: true,
        frame0Prompt: 'Use the attached brand logo as the reference for the lid branding. Create a premium luxury jewelry campaign image in a fixed celestial teaser state. Show a fully closed luxury jewelry box centered in frame, placed in a refined cosmic setting. The scene must use this fixed celestial template language: a centered composition, a soft circular halo behind the box, a deep midnight-blue and navy celestial background, subtle indigo and teal nebula haze, an elegant star field, a faint sparkling dust ring around the base, and a dark glossy reflective surface below. This is the pre-reveal dormant frame, so the scene should feel calmer, darker, quieter, and more mysterious. The halo should be softer, dimmer, and slightly tighter. The nebula should feel more distant and restrained. The stars should be subtler and less radiant. The sparkle ring around the base should be faint and controlled. The floor reflection should be darker and weaker. There must be no inner glow from the box, no reveal burst, and no activated magical energy. The jewelry box must be perfectly closed and flush, with zero visible gap, zero visible interior, zero visible lining, zero visible cushion, and zero jewelry visible. The logo on the lid should be rendered as a premium engraved, debossed, or blind-embossed mark naturally integrated into the material. Use the logo as shape reference only. It must look built into the lid, elegant and tactile, not pasted, printed, sticker-like, glossy, or floating. Keep everything stable, centered, cinematic, premium, and uncluttered. This frame should feel like a luxury teaser before activation. No text. No watermark.',
        frame1Prompt: 'Use the attached jewelry item as the exact product reference. Create a premium luxury jewelry campaign image in the same celestial template, but now in an awakened reveal state. Show the same jewelry box opened elegantly, with the jewelry beautifully presented inside as the hero. The jewelry must remain faithful to the reference in silhouette, structure, proportions, stone placement, and overall design identity. Do not redesign, distort, simplify, or replace the jewelry. Keep the same celestial world and same centered composition language as the teaser frame: centered box, circular halo behind it, deep midnight-blue celestial sky, nebula atmosphere, elegant stars, sparkling ring around the base, and a glossy reflective surface below. However, this must now feel like the activated version of that same world. Make the scene visibly more radiant and alive. The halo should be larger, brighter, fuller, and more luminous. The nebula should be richer, more visible, and slightly expanded outward. The stars should be brighter and more sparkling. The dust ring around the base should be more energized and complete. The floor reflection should be stronger and cleaner. Add a soft inner reveal glow from inside the box so the jewelry becomes the focal point. To support animation, the celestial background elements should feel like they have subtly shifted and awakened compared to the closed frame: nebula clouds may drift slightly, particles may spread outward, the halo may expand, stars may twinkle more clearly, and the sparkle ring may appear more active and opened up. These changes should be elegant and controlled, not chaotic. The open frame should clearly feel like the same world after activation. Keep the composition premium, stable, centered, cinematic, and uncluttered. No text. No watermark.',
        videoPrompt: 'Create a smooth luxury jewelry reveal animation in a fixed celestial campaign template. Begin with a fully closed premium jewelry box in a calm, dormant celestial world, then transition into the same box opening gracefully to reveal the jewelry inside. The composition must remain centered, elegant, and stable throughout. Keep the visual language consistent across the animation: a centered jewelry box, a soft circular halo behind it, a deep midnight-blue celestial sky, subtle nebula atmosphere, elegant stars, a sparkling dust ring around the base, and a dark glossy reflective surface below. The animation should clearly show a dormant-to-awakened transformation: at the start, the scene feels quieter, dimmer, and more mysterious; as the box opens, the celestial world gradually becomes brighter, richer, and more alive; the halo softly expands and brightens; stars shimmer more; cosmic particles become slightly more active; the sparkle ring around the base becomes more energized; the floor reflection becomes a little stronger; and a soft inner glow emerges from the box as the jewelry is revealed. The motion must feel premium, cinematic, slow, and graceful. The lid should open smoothly and naturally, with no sudden movement. The camera may have a very slight push-in or subtle floating parallax, but the frame must remain stable and centered. Background motion should stay soft and elegant: gentle nebula drift, faint particle movement, subtle star twinkle, and delicate light breathing. The result should feel like a luxury celestial teaser transforming into a magical jewelry reveal, while preserving the same template structure from beginning to end. Avoid fast movement, jitter, scene redesign, box shape changes, jewelry distortion, sudden zooms, chaotic particles, excessive magical effects, random new objects, heavy sci-fi effects, text',
      },
    ],
  },
]

// ─── Lookup Helpers ──────────────────────────────────────────────────────────

export function getVideoTemplate(templateId: string): VideoTemplate | undefined {
  return VIDEO_TEMPLATES.find((t) => t.id === templateId)
}

export function getVideoSubTemplate(
  templateId: string,
  subTemplateId: string,
): VideoSubTemplate | undefined {
  const template = getVideoTemplate(templateId)
  return template?.subTemplates.find((s) => s.id === subTemplateId)
}
