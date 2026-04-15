// ─── Session States ──────────────────────────────────────────────────────────

export type SessionState =
  | 'IDLE'
  | 'AWAITING_IMAGE'
  | 'ANALYZING'
  | 'AWAITING_TEMPLATE'
  | 'AWAITING_ASPECT_RATIO'
  | 'AWAITING_CONFIRMATION'
  | 'PROCESSING'
  | 'COMPLETE'
  | 'PRICE_CALC_WEIGHT'
  | 'PRICE_CALC_MAKING'
  | 'BILLING_METAL'
  | 'BILLING_WEIGHT'
  | 'BILLING_MAKING'
  | 'BILLING_STONE'
  | 'BILLING_DONE'
  | 'INVOICE_CUSTOMER_NAME'
  | 'INVOICE_CUSTOMER_GSTIN'
  | 'LEDGER_MENU'
  | 'LEDGER_ADD_NAME'
  | 'LEDGER_ADD_AMOUNT'
  | 'LEDGER_ADD_DESC'
  | 'LEDGER_PAY_NAME'
  | 'LEDGER_PAY_AMOUNT'
  | 'LEDGER_VIEW_NAME'
  | 'UPGRADE_SELECT'
  | 'CREDIT_PACK_SELECT'
  | 'BIZ_NAME'
  | 'BIZ_GSTIN'
  | 'BIZ_ADDRESS'
  | 'BIZ_STATE'
  | 'BIZ_PHONE'
  | 'BATCH_COLLECTING'
  | 'BATCH_TEMPLATE'
  | 'BATCH_ASPECT_RATIO'
  | 'BATCH_CONFIRM'
  | 'BATCH_PROCESSING'
  | 'FESTIVE_BRAND_LOGO'
  | 'FESTIVE_BRAND_NAME'
  | 'FESTIVE_BRAND_PHONE'
  | 'FESTIVE_FESTIVAL_INPUT'
  | 'FESTIVE_CONFIRM'
  | 'FESTIVE_PROCESSING'
  | 'AWAITING_JEWEL_TYPE'
  | 'BATCH_JEWEL_TYPE'
  | 'VIDEO_UPLOAD'
  | 'VIDEO_TEMPLATE'
  | 'VIDEO_SUB_TEMPLATE'
  | 'VIDEO_ASPECT_RATIO'
  | 'VIDEO_CONFIRM'
  | 'VIDEO_PROCESSING'

export interface SessionData {
  sourceImageUrl?: string
  sourceMediaId?: string
  jewellType?: string
  jewellDescription?: string
  selectedTemplateId?: string
  aspectRatio?: '1:1' | '9:16'
  bullJobId?: string
  pendingJobId?: string
  // Price calculator
  priceCalcMetal?: string       // e.g. 'gold_24k', 'gold_22k', 'silver_999'
  priceCalcWeightGrams?: number
  // Billing calculator
  billingMetal?: string          // e.g. 'gold_24k', 'gold_22k', 'silver_999'
  billingWeightGrams?: number
  billingMakingPerGram?: number
  billingStoneCost?: number
  // Invoice
  invoiceMode?: boolean           // true = auto-continue to invoice after billing
  invoiceCustomerName?: string
  invoiceCustomerGstin?: string
  // Computed billing results (preserved for invoice)
  billingMetalRate?: number
  billingMetalCost?: number
  billingMakingTotal?: number
  billingSubtotal?: number
  billingGst?: number
  billingTotal?: number
  // Ledger
  ledgerCustomerName?: string
  ledgerCustomerId?: string
  ledgerAmountPaise?: number
  // Business profile setup
  bizSetupName?: string
  bizSetupGstin?: string
  bizSetupAddress?: string
  bizSetupState?: string
  bizSetupReturnToInvoice?: boolean  // true = go to invoice after setup
  // Batch image creation
  batchImages?: { url: string; jewellType: string; description: string }[]
  batchTemplateId?: string
  batchTemplateName?: string
  batchAspectRatio?: '1:1' | '9:16'
  batchLastImageTime?: number  // timestamp of last image received, for debounce
  // Festive post
  festiveLogoUrl?: string
  festiveBrandName?: string
  festiveBrandPhone?: string
  festiveFestivalName?: string
  festivePrompt?: string
  // Video creation
  videoSourceImageUrl?: string
  videoTemplateId?: string
  videoSubTemplateId?: string
  videoAspectRatio?: '16:9' | '9:16'
}

// ─── Jewelry Analysis ─────────────────────────────────────────────────────────

export type JewellType =
  | 'ring'
  | 'necklace'
  | 'bracelet'
  | 'bangle'
  | 'pendant'
  | 'earrings'
  | 'nose_pin'
  | 'anklet'
  | 'brooch'
  | 'jewelry_set'
  | 'other'

export interface JewelryAnalysis {
  description: string
  jewel_type: JewellType
}

// ─── Plans ────────────────────────────────────────────────────────────────────

export type PlanId = 'FREE' | 'STARTER' | 'SHOP' | 'PRO' | 'WHOLESALE'

export const PLAN_CREDITS: Record<PlanId, number> = {
  FREE: 25,        // lifetime demo
  STARTER: 80,     // per month
  SHOP: 200,       // per month
  PRO: 500,        // per month
  WHOLESALE: 1400, // per month
}

export const PLAN_PRICES_INR: Record<Exclude<PlanId, 'FREE'>, number> = {
  STARTER: 99,
  SHOP: 499,
  PRO: 999,
  WHOLESALE: 1999,
}

// ─── Credit Costs ────────────────────────────────────────────────────────────

export const CREDIT_COST_PHOTO = 5

// ─── Credit Packs (one-time purchase) ────────────────────────────────────────

export type CreditPackId = 'pack_200' | 'pack_400' | 'pack_1000' | 'pack_2500' | 'pack_5000'

export interface CreditPack {
  id: CreditPackId
  credits: number
  priceInr: number
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: 'pack_200',  credits: 200,  priceInr: 200 },
  { id: 'pack_400',  credits: 400,  priceInr: 379 },
  { id: 'pack_1000', credits: 1000, priceInr: 925 },
  { id: 'pack_2500', credits: 2500, priceInr: 2250 },
  { id: 'pack_5000', credits: 5000, priceInr: 4399 },
]

// ─── Image Gen Job Payload ────────────────────────────────────────────────────

export interface ImageGenJobPayload {
  jobId: string
  userId: string
  userPhone: string
  sourceImageUrl: string
  templateId: string
  jewellType: string
  jewellDescription: string
  aspectRatio: '1:1' | '9:16'
}

export interface VideoGenJobPayload {
  jobId: string
  userId: string
  userPhone: string
  sourceImageUrl: string   // jewelry photo
  logoUrl?: string         // brand logo (for templates that use it)
  templateId: string
  subTemplateId: string
  aspectRatio: '16:9' | '9:16'
}

export interface FestivePostJobPayload {
  jobId: string
  userId: string
  userPhone: string
  logoUrl: string
  brandName: string
  brandPhone: string
  festivalName: string
  prompt: string
}
