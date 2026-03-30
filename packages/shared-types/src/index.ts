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
  | 'BIZ_NAME'
  | 'BIZ_GSTIN'
  | 'BIZ_ADDRESS'
  | 'BIZ_STATE'
  | 'BIZ_PHONE'

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
  | 'other'

export interface JewelryAnalysis {
  description: string
  jewel_type: JewellType
}

// ─── Plans ────────────────────────────────────────────────────────────────────

export type PlanId = 'FREE' | 'STARTER' | 'SHOP' | 'PRO' | 'WHOLESALE'

export const PLAN_CREDITS: Record<PlanId, number> = {
  FREE: 5,        // lifetime
  STARTER: 15,    // per month
  SHOP: 75,       // per month
  PRO: 200,       // per month
  WHOLESALE: 700, // per month
}

export const PLAN_PRICES_INR: Record<Exclude<PlanId, 'FREE'>, number> = {
  STARTER: 299,
  SHOP: 899,
  PRO: 1799,
  WHOLESALE: 4299,
}

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
