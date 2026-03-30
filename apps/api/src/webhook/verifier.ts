import crypto from 'node:crypto'
import { env } from '../config/env.js'

/**
 * Verify Meta's HMAC-SHA256 webhook signature.
 * Header: X-Hub-Signature-256: sha256=<hex>
 */
export function verifyMetaSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!signatureHeader) return false

  const expected = crypto
    .createHmac('sha256', env.META_APP_SECRET)
    .update(rawBody)
    .digest('hex')

  const received = signatureHeader.replace('sha256=', '')

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'))
  } catch {
    return false
  }
}
