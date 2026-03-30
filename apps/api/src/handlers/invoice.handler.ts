import type { FastifyInstance } from 'fastify'
import type { MetaMessage, MetaInteractiveMessage, MetaTextMessage } from '../whatsapp/wa.types.js'
import { sendText, sendButtons } from '../whatsapp/wa.messages.js'
import { getSession, transitionState, resetSession } from '../session/session.service.js'
import { ALL_METALS } from '../features/price-calculator/metals-rate.service.js'
import { env } from '../config/env.js'

const INVOICE_COUNTER_KEY = 'invoice:counter'

// ── Step 1: Capture customer name → ask GSTIN ────────────────────────────────

export async function handleInvoiceCustomerName(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'text') {
    await sendText(phone, 'Please type the *customer name*:')
    return
  }

  const name = (message as MetaTextMessage).text.body.trim()
  if (name.length < 2 || name.length > 100) {
    await sendText(phone, '❌ Please enter a valid name (2-100 characters).')
    return
  }

  await transitionState(fastify.redis, phone, 'INVOICE_CUSTOMER_GSTIN', {
    invoiceCustomerName: name,
  })

  await sendButtons(phone, `✅ Customer: *${name}*\n\nDoes the customer have a *GSTIN*?`, [
    { type: 'reply', reply: { id: 'gstin_yes', title: '✅ Yes, enter GSTIN' } },
    { type: 'reply', reply: { id: 'gstin_skip', title: '⏭️ Skip (B2C)' } },
    { type: 'reply', reply: { id: 'cancel_invoice', title: '❌ Cancel' } },
  ])
}

// ── Step 2: Capture GSTIN or skip → generate invoice ─────────────────────────

export async function handleInvoiceCustomerGstin(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  // Handle button presses
  if (message.type === 'interactive') {
    const interactive = (message as MetaInteractiveMessage).interactive
    const replyId =
      interactive?.type === 'button_reply'
        ? interactive.button_reply.id
        : ''

    if (replyId === 'cancel_invoice') {
      await resetSession(fastify.redis, phone)
      return
    }

    if (replyId === 'gstin_skip') {
      return generateAndSendInvoice(phone, fastify, '')
    }

    if (replyId === 'gstin_yes') {
      await sendText(phone, 'Enter the customer *GSTIN* (15 characters):\n_(e.g. 27AABCU9603R1ZM)_')
      return
    }
  }

  // Handle text input (GSTIN)
  if (message.type === 'text') {
    const gstin = (message as MetaTextMessage).text.body.trim().toUpperCase()

    // Basic GSTIN validation: 15 chars, pattern: 2-digit state + 10-char PAN + 1 + Z + 1
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
    if (!gstinRegex.test(gstin)) {
      await sendText(phone, '❌ Invalid GSTIN format. Please enter a valid 15-character GSTIN:\n_(e.g. 27AABCU9603R1ZM)_')
      return
    }

    return generateAndSendInvoice(phone, fastify, gstin)
  }

  await sendText(phone, 'Please enter the GSTIN or tap *Skip* for B2C invoice.')
}

// ── Invoice Generation ───────────────────────────────────────────────────────

async function generateAndSendInvoice(
  phone: string,
  fastify: FastifyInstance,
  customerGstin: string,
): Promise<void> {
  const session = await getSession(fastify.redis, phone)
  const d = session?.data

  if (!d?.billingMetal || !d?.billingWeightGrams || !d?.billingTotal || !d?.invoiceCustomerName) {
    await sendText(phone, '⚠️ Session expired. Please start the billing calculator again.')
    await resetSession(fastify.redis, phone)
    return
  }

  // Auto-increment invoice number
  const invoiceNum = await fastify.redis.incr(INVOICE_COUNTER_KEY)
  const invoiceId = `JWL-${String(invoiceNum).padStart(5, '0')}`

  const metal = ALL_METALS[d.billingMetal]
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
  const timeStr = now.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  })

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`

  // GST split: CGST 1.5% + SGST 1.5% (intra-state)
  const cgst = Math.round(d.billingGst! / 2)
  const sgst = d.billingGst! - cgst

  const isB2B = customerGstin.length > 0
  const stoneCost = d.billingStoneCost ?? 0

  const invoice = [
    `━━━━━━━━━━━━━━━━━━━━━━━`,
    `📄 *TAX INVOICE*`,
    `━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `*${env.BUSINESS_NAME}*`,
    ...(env.BUSINESS_GSTIN ? [`GSTIN: ${env.BUSINESS_GSTIN}`] : []),
    ...(env.BUSINESS_ADDRESS ? [env.BUSINESS_ADDRESS] : []),
    ...(env.BUSINESS_PHONE ? [`Ph: ${env.BUSINESS_PHONE}`] : []),
    ``,
    `───────────────────────`,
    `Invoice No: *${invoiceId}*`,
    `Date: ${dateStr}  ${timeStr}`,
    `───────────────────────`,
    ``,
    `*Bill To:*`,
    `${d.invoiceCustomerName}`,
    ...(isB2B ? [`GSTIN: ${customerGstin}`] : [`(B2C — Unregistered)`]),
    ``,
    `───────────────────────`,
    `*ITEM DETAILS*`,
    `───────────────────────`,
    ``,
    `Item: ${metal?.label ?? d.billingMetal}`,
    `HSN: ${d.billingMetal.startsWith('gold_') ? '7108' : '7106'}`,
    `Weight: ${d.billingWeightGrams}g`,
    `Rate: ${fmt(d.billingMetalRate!)}/g`,
    ``,
    `┌───────────────────────`,
    `│ Metal Value:     ${fmt(d.billingMetalCost!)}`,
    `│ Making Charges:  ${fmt(d.billingMakingTotal!)}`,
    ...(stoneCost > 0 ? [`│ Stone/Extra:     ${fmt(stoneCost)}`] : []),
    `├───────────────────────`,
    `│ Taxable Value:   ${fmt(d.billingSubtotal!)}`,
    `│ CGST @ 1.5%:    ${fmt(cgst)}`,
    `│ SGST @ 1.5%:    ${fmt(sgst)}`,
    `╞═══════════════════════`,
    `│ *GRAND TOTAL:    ${fmt(d.billingTotal!)}*`,
    `└───────────────────────`,
    ``,
    `*Amount in Words:*`,
    `_${numberToWords(d.billingTotal!)} Rupees Only_`,
    ``,
    `───────────────────────`,
    `_This is a computer-generated invoice._`,
    `_${env.BUSINESS_NAME}_`,
  ].join('\n')

  await sendText(phone, invoice)

  // Reset to idle
  await resetSession(fastify.redis, phone)
}

// ── Number to Words (Indian system) ──────────────────────────────────────────

function numberToWords(num: number): string {
  if (num === 0) return 'Zero'

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  function twoDigits(n: number): string {
    if (n < 20) return ones[n]
    return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
  }

  function threeDigits(n: number): string {
    if (n >= 100) {
      return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + twoDigits(n % 100) : '')
    }
    return twoDigits(n)
  }

  // Indian numbering: Crore, Lakh, Thousand, Hundred
  const n = Math.round(num)
  const crore = Math.floor(n / 10000000)
  const lakh = Math.floor((n % 10000000) / 100000)
  const thousand = Math.floor((n % 100000) / 1000)
  const remainder = n % 1000

  const parts: string[] = []
  if (crore) parts.push(twoDigits(crore) + ' Crore')
  if (lakh) parts.push(twoDigits(lakh) + ' Lakh')
  if (thousand) parts.push(twoDigits(thousand) + ' Thousand')
  if (remainder) parts.push(threeDigits(remainder))

  return parts.join(' ') || 'Zero'
}
