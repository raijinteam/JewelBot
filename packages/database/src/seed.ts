import { prisma } from './index'

const templates = [
  // ── E-commerce ──────────────────────────────────────────────────────────
  {
    id: 'tpl_white_bg',
    name: 'White Background Classic',
    category: 'E-commerce',
    previewUrl: 'https://placehold.co/400x400?text=White+BG',
    basePrompt:
      'Professional jewelry product photography, isolated on a pure white background, soft diffused lighting, subtle shadow underneath, e-commerce style, 4K ultra-sharp, no background distractions',
    compatibleTypes: ['*'],
    planRequired: 'FREE',
    sortOrder: 1,
  },
  {
    id: 'tpl_gradient_bg',
    name: 'Floating on Gradient',
    category: 'E-commerce',
    previewUrl: 'https://placehold.co/400x400?text=Gradient',
    basePrompt:
      'Professional jewelry photography, floating on a soft pastel gradient background, elegant studio lighting, crisp details, luxury product shot',
    compatibleTypes: ['*'],
    planRequired: 'FREE',
    sortOrder: 2,
  },
  {
    id: 'tpl_shadow_drop',
    name: 'Shadow Drop Display',
    category: 'E-commerce',
    previewUrl: 'https://placehold.co/400x400?text=Shadow+Drop',
    basePrompt:
      'High-end jewelry photography, displayed on a clean surface with a dramatic shadow drop below, overhead flat-lay angle, minimalist luxury aesthetic',
    compatibleTypes: ['*'],
    planRequired: 'FREE',
    sortOrder: 3,
  },

  // ── Lifestyle & Fashion ──────────────────────────────────────────────────
  {
    id: 'tpl_model_hand',
    name: 'Worn by Model (Hand)',
    category: 'Lifestyle & Fashion',
    previewUrl: 'https://placehold.co/400x400?text=Model+Hand',
    basePrompt:
      'Fashion jewelry photography, worn on elegant female hand with neutral nail polish, soft natural lighting, shallow depth of field, lifestyle aesthetic',
    compatibleTypes: ['ring', 'bangle', 'bracelet'],
    planRequired: 'FREE',
    sortOrder: 4,
  },
  {
    id: 'tpl_model_neck',
    name: 'Worn by Model (Neck)',
    category: 'Lifestyle & Fashion',
    previewUrl: 'https://placehold.co/400x400?text=Model+Neck',
    basePrompt:
      'Fashion jewelry photography, worn around a graceful female neck, soft bokeh background, warm studio lighting, editorial style',
    compatibleTypes: ['necklace', 'pendant'],
    planRequired: 'FREE',
    sortOrder: 5,
  },
  {
    id: 'tpl_model_ear',
    name: 'Worn by Model (Ear)',
    category: 'Lifestyle & Fashion',
    previewUrl: 'https://placehold.co/400x400?text=Model+Ear',
    basePrompt:
      'Fashion jewelry photography, worn on ear, soft portrait lighting, hair gently swept aside, shallow depth of field, high-end editorial style',
    compatibleTypes: ['earrings'],
    planRequired: 'FREE',
    sortOrder: 6,
  },
  {
    id: 'tpl_flat_lay',
    name: 'Flat Lay Lifestyle',
    category: 'Lifestyle & Fashion',
    previewUrl: 'https://placehold.co/400x400?text=Flat+Lay',
    basePrompt:
      'Flat lay jewelry photography, arranged on a textured neutral surface with complementary props (flowers, fabric), overhead shot, warm natural lighting, Instagram-style aesthetic',
    compatibleTypes: ['*'],
    planRequired: 'FREE',
    sortOrder: 7,
  },

  // ── Festive & Campaign ────────────────────────────────────────────────────
  {
    id: 'tpl_bridal',
    name: 'Bridal / Wedding Gold',
    category: 'Festive & Campaign',
    previewUrl: 'https://placehold.co/400x400?text=Bridal',
    basePrompt:
      'Bridal jewelry campaign photography, warm golden hour lighting, soft red and gold bokeh background, marigold flowers subtly in frame, luxury wedding aesthetic, cinematic',
    compatibleTypes: ['*'],
    planRequired: 'FREE',
    sortOrder: 8,
  },
  {
    id: 'tpl_festival',
    name: 'Festival & Celebration',
    category: 'Festive & Campaign',
    previewUrl: 'https://placehold.co/400x400?text=Festival',
    basePrompt:
      'Festive jewelry photography, vibrant colorful background with Diwali diyas and sparkles, warm celebratory lighting, rich colors, joyful festive mood',
    compatibleTypes: ['*'],
    planRequired: 'FREE',
    sortOrder: 9,
  },
  {
    id: 'tpl_luxury_dark',
    name: 'Luxury Dark Velvet',
    category: 'Festive & Campaign',
    previewUrl: 'https://placehold.co/400x400?text=Dark+Velvet',
    basePrompt:
      'Ultra-luxury jewelry photography, resting on deep black velvet, dramatic single-source lighting highlighting gemstones and metalwork, dark moody background, Cartier-style editorial',
    compatibleTypes: ['*'],
    planRequired: 'FREE',
    sortOrder: 10,
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
