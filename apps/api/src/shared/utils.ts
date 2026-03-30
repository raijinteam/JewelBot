/**
 * Normalize phone numbers to E.164 format without leading +
 * WhatsApp sends numbers like "919876543210" (country code + number)
 */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

/** Sleep utility for polling loops */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Truncate a string for logging */
export function truncate(str: string, max = 100): string {
  return str.length > max ? str.slice(0, max) + '…' : str
}

