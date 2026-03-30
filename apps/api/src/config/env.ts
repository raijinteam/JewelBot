import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // WhatsApp / Meta
  META_APP_ID: z.string().min(1),
  META_APP_SECRET: z.string().min(1),
  META_PHONE_NUMBER_ID: z.string().min(1),
  META_ACCESS_TOKEN: z.string().min(1),
  META_VERIFY_TOKEN: z.string().min(1),

  // OpenAI
  OPENAI_API_KEY: z.string().min(1),

  // Kie AI (NanoBanana 2)
  KIE_AI_API_KEY: z.string().min(1),
  KIE_AI_BASE_URL: z.string().url().default('https://api.kie.ai'),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),

  // AWS S3
  AWS_S3_BUCKET: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('ap-south-1'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Razorpay
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // Gold Price API (goldapi.io — free tier: 300 req/month)
  GOLD_API_KEY: z.string().optional(),

  // Business Profile (for GST invoices)
  BUSINESS_NAME: z.string().default('Your Jewelry Store'),
  BUSINESS_GSTIN: z.string().default(''),
  BUSINESS_ADDRESS: z.string().default(''),
  BUSINESS_STATE: z.string().default('Maharashtra'),
  BUSINESS_STATE_CODE: z.string().default('27'),
  BUSINESS_PHONE: z.string().default(''),

  // App
  APP_URL: z.string().url().default('http://localhost:3000'),
})

function loadEnv() {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error('Invalid environment variables:')
    for (const [key, issues] of Object.entries(result.error.flatten().fieldErrors)) {
      console.error(`  ${key}: ${issues?.join(', ')}`)
    }
    process.exit(1)
  }
  return result.data
}

export const env = loadEnv()
export type Env = typeof env
