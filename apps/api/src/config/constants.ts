// WhatsApp conversation session TTL (matches Meta's 24-hour window)
export const SESSION_TTL_SECONDS = 86400

// How long to keep a session in ANALYZING state before timing out
export const ANALYZE_TIMEOUT_MS = 60_000

// Max image file size accepted (in bytes) - 16MB
export const MAX_IMAGE_SIZE_BYTES = 16 * 1024 * 1024

// BullMQ queue names
export const QUEUES = {
  IMAGE_GENERATION: 'image-generation',
} as const

// Free tier lifetime credits
export const FREE_TIER_LIFETIME_CREDITS = 5

// Session state names (mirrors @jewel/shared-types SessionState)
export const STATES = {
  IDLE: 'IDLE',
  AWAITING_IMAGE: 'AWAITING_IMAGE',
  ANALYZING: 'ANALYZING',
  AWAITING_TEMPLATE: 'AWAITING_TEMPLATE',
  AWAITING_ASPECT_RATIO: 'AWAITING_ASPECT_RATIO',
  AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
  PROCESSING: 'PROCESSING',
  COMPLETE: 'COMPLETE',
  PRICE_CALC_WEIGHT: 'PRICE_CALC_WEIGHT',
  PRICE_CALC_MAKING: 'PRICE_CALC_MAKING',
  BILLING_METAL: 'BILLING_METAL',
  BILLING_WEIGHT: 'BILLING_WEIGHT',
  BILLING_MAKING: 'BILLING_MAKING',
  BILLING_STONE: 'BILLING_STONE',
  BILLING_DONE: 'BILLING_DONE',
  INVOICE_CUSTOMER_NAME: 'INVOICE_CUSTOMER_NAME',
  INVOICE_CUSTOMER_GSTIN: 'INVOICE_CUSTOMER_GSTIN',
  LEDGER_MENU: 'LEDGER_MENU',
  LEDGER_ADD_NAME: 'LEDGER_ADD_NAME',
  LEDGER_ADD_AMOUNT: 'LEDGER_ADD_AMOUNT',
  LEDGER_ADD_DESC: 'LEDGER_ADD_DESC',
  LEDGER_PAY_NAME: 'LEDGER_PAY_NAME',
  LEDGER_PAY_AMOUNT: 'LEDGER_PAY_AMOUNT',
  LEDGER_VIEW_NAME: 'LEDGER_VIEW_NAME',
  UPGRADE_SELECT: 'UPGRADE_SELECT',
} as const

// Meta Cloud API base URL
export const META_API_BASE = 'https://graph.facebook.com/v21.0'

// Supported languages for auto-detection
export const SUPPORTED_LANGUAGES = ['en', 'hi', 'gu', 'ta', 'te', 'mr'] as const
