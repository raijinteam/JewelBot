import { prisma } from './index'

const templates = [
  // ── E-commerce ──────────────────────────────────────────────────────────
  {
    id: 'tpl_white_bg',
    name: 'White Background Classic',
    category: 'E-commerce',
    previewUrl: 'https://res.cloudinary.com/dhbq4ad3t/image/upload/v1775295111/White-bg_lq7qni.png',
    basePrompt:
      'Professional jewelry product photography, isolated on a pure white background, soft diffused lighting, subtle shadow underneath, e-commerce style, 4K ultra-sharp, no background distractions',
    compatibleTypes: ['*'],
    planRequired: 'FREE',
    sortOrder: 1,
  },

  // ── Lifestyle & Fashion ──────────────────────────────────────────────────
  {
    id: 'tpl_model_finger',
    name: 'Worn by Model (Finger)',
    category: 'Lifestyle & Fashion',
    previewUrl: 'https://res.cloudinary.com/dhbq4ad3t/image/upload/v1775295112/ring-model_on4nhg.png',
    basePrompt:
      'Fashion jewelry photography, ring worn on elegant female finger, close-up of hand with neutral nail polish, soft natural lighting, shallow depth of field, focus on the ring, lifestyle aesthetic',
    compatibleTypes: ['ring'],
    planRequired: 'FREE',
    sortOrder: 4,
  },
  {
    id: 'tpl_model_bracelet',
    name: 'Worn by Model (Bracelet)',
    category: 'Lifestyle & Fashion',
    previewUrl: 'https://res.cloudinary.com/dhbq4ad3t/image/upload/v1775295110/Bracelet-model_xjkr2t.png',
    basePrompt:
      'Fashion jewelry photography, bracelet worn on elegant female wrist, soft natural lighting, shallow depth of field, close-up focus on the bracelet, lifestyle aesthetic',
    compatibleTypes: ['bracelet'],
    planRequired: 'FREE',
    sortOrder: 5,
  },
  {
    id: 'tpl_model_bangle',
    name: 'Worn by Model (Bangle)',
    category: 'Lifestyle & Fashion',
    previewUrl: 'https://res.cloudinary.com/dhbq4ad3t/image/upload/v1775295110/Bangle-model_sqb8lw.png',
    basePrompt:
      'Premium fashion jewelry photography of the exact reference piece worn on an elegant female wrist. Preserve the original jewelry design exactly as provided. If the bangle is open, keep it open. If the bangle is closed, keep it closed. Do not alter the structure, silhouette, proportions, opening, tips, stone shape, or setting. Keep the exact pointed tapered tip and the exact bezel-set deep red trillion-cut gemstone. Soft natural lighting, shallow depth of field, refined luxury lifestyle aesthetic, realistic editorial product photography, focus on the wrist jewelry.',
    compatibleTypes: ['bangle'],
    planRequired: 'FREE',
    sortOrder: 6,
  },
  {
    id: 'tpl_model_neck',
    name: 'Worn by Model (Neck)',
    category: 'Lifestyle & Fashion',
    previewUrl: 'https://res.cloudinary.com/dhbq4ad3t/image/upload/v1775295110/Necklace-model_w7fqrg.png',
    basePrompt:
      'Fashion jewelry photography, worn by an elegant Indian female model, necklace visible on neck with face shown, soft bokeh background, warm studio lighting, portrait framing from chest up, editorial style',
    compatibleTypes: ['necklace', 'pendant'],
    planRequired: 'FREE',
    sortOrder: 7,
  },
  {
    id: 'tpl_model_ear',
    name: 'Worn by Model (Ear)',
    category: 'Lifestyle & Fashion',
    previewUrl: 'https://res.cloudinary.com/dhbq4ad3t/image/upload/v1775295112/Earring-model_za8kfr.png',
    basePrompt:
      'Fashion jewelry photography, worn on ear, soft portrait lighting, hair gently swept aside, shallow depth of field, high-end editorial style',
    compatibleTypes: ['earrings'],
    planRequired: 'FREE',
    sortOrder: 8,
  },
  {
    id: 'tpl_model_set',
    name: 'Worn by Model (Full Set)',
    category: 'Lifestyle & Fashion',
    previewUrl: 'https://res.cloudinary.com/dhbq4ad3t/image/upload/v1775295110/Set-Model_o7cqbe.png',
    basePrompt:
      'Fashion jewelry photography, complete matching jewelry set (necklace and earrings) worn by an elegant Indian female model, soft studio lighting, shallow depth of field, luxury bridal editorial style, warm tones',
    compatibleTypes: ['jewelry_set'],
    planRequired: 'FREE',
    sortOrder: 9,
  },
  {
    id: 'tpl_flat_lay',
    name: 'Flat Lay Lifestyle',
    category: 'Lifestyle & Fashion',
    previewUrl: 'https://res.cloudinary.com/dhbq4ad3t/image/upload/v1775295111/tpl-flat-lay_e1xs2i.png',
    basePrompt:
      'Flat lay jewelry photography, arranged on a textured neutral surface with complementary props (flowers, fabric), overhead shot, warm natural lighting, Instagram-style aesthetic',
    compatibleTypes: ['*'],
    planRequired: 'FREE',
    sortOrder: 10,
  },

  // ── Festive & Campaign ────────────────────────────────────────────────────
  {
    id: 'tpl_bridal',
    name: 'Bridal / Wedding Gold',
    category: 'Festive & Campaign',
    previewUrl: 'https://res.cloudinary.com/dhbq4ad3t/image/upload/v1775295112/tpl-bridal_p7cjla.png',
    basePrompt:
      'Bridal jewelry campaign photography, warm golden hour lighting, soft red and gold bokeh background, marigold flowers subtly in frame, luxury wedding aesthetic, cinematic',
    compatibleTypes: ['*'],
    planRequired: 'FREE',
    sortOrder: 11,
  },
  {
    id: 'tpl_festival',
    name: 'Festival & Celebration',
    category: 'Festive & Campaign',
    previewUrl: 'https://res.cloudinary.com/dhbq4ad3t/image/upload/v1775295110/tpl-festival_hwhhjv.png',
    basePrompt:
      'Festive jewelry photography, vibrant colorful background with Diwali diyas and sparkles, warm celebratory lighting, rich colors, joyful festive mood',
    compatibleTypes: ['*'],
    planRequired: 'FREE',
    sortOrder: 12,
  },
  {
    id: 'tpl_luxury_dark',
    name: 'Luxury Dark Velvet',
    category: 'Festive & Campaign',
    previewUrl: 'https://res.cloudinary.com/dhbq4ad3t/image/upload/v1775295110/tpl-luxury-dark_kgeik0.png',
    basePrompt:
      'Ultra-luxury jewelry photography, resting on deep black velvet, dramatic single-source lighting highlighting gemstones and metalwork, dark moody background, Cartier-style editorial',
    compatibleTypes: ['*'],
    planRequired: 'FREE',
    sortOrder: 13,
  },
]

const appConfigs: { key: string; value: string }[] = [
  { key: 'plan_price_starter', value: '149' },
  { key: 'plan_price_shop', value: '499' },
  { key: 'plan_price_pro', value: '999' },
  { key: 'plan_price_wholesale', value: '1999' },
  { key: 'plan_credits_free', value: '25' },
  { key: 'plan_credits_starter', value: '50' },
  { key: 'plan_credits_shop', value: '200' },
  { key: 'plan_credits_pro', value: '500' },
  { key: 'plan_credits_wholesale', value: '1400' },
]

async function seed() {
  console.log('Seeding templates...')
  for (const tpl of templates) {
    await prisma.template.upsert({
      where: { id: tpl.id },
      update: tpl,
      create: tpl,
    })
  }
  console.log(`✓ Seeded ${templates.length} templates`)

  console.log('Seeding app config...')
  for (const config of appConfigs) {
    await prisma.appConfig.upsert({
      where: { key: config.key },
      update: { value: config.value },
      create: config,
    })
  }
  console.log(`✓ Seeded ${appConfigs.length} app config entries`)

  await prisma.$disconnect()
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
