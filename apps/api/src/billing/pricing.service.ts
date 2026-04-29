// ─── Premium country detection + dynamic pricing ────────────────────────────
//
// For users from developed countries we charge 2× the base INR price and
// display the equivalent in USD. Razorpay still charges in INR; the user's
// card converts to their local currency at the bank's rate.

const USD_INR_RATE = 83

// Phone prefixes for "premium" countries (sorted by length-desc at lookup)
const PREMIUM_COUNTRY_PREFIXES = [
  // North America
  '1',     // USA, Canada
  // United Kingdom
  '44',
  // Europe (developed)
  '49',    // Germany
  '33',    // France
  '39',    // Italy
  '34',    // Spain
  '31',    // Netherlands
  '32',    // Belgium
  '41',    // Switzerland
  '43',    // Austria
  '46',    // Sweden
  '47',    // Norway
  '45',    // Denmark
  '358',   // Finland
  '353',   // Ireland
  '351',   // Portugal
  '352',   // Luxembourg
  '354',   // Iceland
  '30',    // Greece
  '420',   // Czech Republic
  // Oceania
  '61',    // Australia
  '64',    // New Zealand
  // Middle East (developed)
  '971',   // UAE
  '966',   // Saudi Arabia
  '974',   // Qatar
  '965',   // Kuwait
  '973',   // Bahrain
  '968',   // Oman
  '972',   // Israel
  // Asia (developed)
  '81',    // Japan
  '82',    // South Korea
  '65',    // Singapore
  '852',   // Hong Kong
  '886',   // Taiwan
]

// Sort longest-first so multi-digit prefixes match before single-digit ones
const SORTED_PREFIXES = [...PREMIUM_COUNTRY_PREFIXES].sort((a, b) => b.length - a.length)

/**
 * Detect whether a phone number belongs to a "premium" (developed) country.
 * Phone is expected to include the country code (no leading + needed).
 */
export function isPremiumCountry(phone: string): boolean {
  const digits = phone.replace(/^\+/, '').replace(/\D/g, '')
  return SORTED_PREFIXES.some((prefix) => digits.startsWith(prefix))
}

export interface DisplayPrice {
  currency: 'INR' | 'USD'
  inrCharge: number       // amount we actually charge via Razorpay (in INR)
  display: string         // formatted string for UI, e.g. "$4.82" or "₹200"
  perCreditDisplay?: string // optional per-credit string, e.g. "$0.024/credit"
}

/**
 * Get the display price for a user based on their phone country.
 * - Premium countries pay 2× the base INR price
 * - Display in USD for premium, INR for everyone else
 */
export function getDisplayPrice(baseInr: number, phone: string, credits?: number): DisplayPrice {
  const premium = isPremiumCountry(phone)
  const inrCharge = premium ? baseInr * 2 : baseInr

  if (premium) {
    const usd = inrCharge / USD_INR_RATE
    const display = `$${usd.toFixed(2)}`
    const perCreditDisplay = credits
      ? `$${(usd / credits).toFixed(3)}/credit`
      : undefined
    return { currency: 'USD', inrCharge, display, perCreditDisplay }
  }

  const display = `₹${inrCharge}`
  const perCreditDisplay = credits
    ? `₹${(inrCharge / credits).toFixed(2)}/credit`
    : undefined
  return { currency: 'INR', inrCharge, display, perCreditDisplay }
}
