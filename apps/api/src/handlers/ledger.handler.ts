import type { FastifyInstance } from 'fastify'
import type { MetaMessage, MetaInteractiveMessage, MetaTextMessage } from '../whatsapp/wa.types.js'
import { sendText, sendList } from '../whatsapp/wa.messages.js'
import { setSession, getSession, resetSession } from '../session/session.service.js'
import { prisma } from '@jewel/database'

const PAISE = 100

function fmt(paise: number): string {
  const rupees = paise / PAISE
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

// ── Show ledger sub-menu ──────────────────────────────────────────────────────

export async function showLedgerMenu(phone: string, fastify: FastifyInstance): Promise<void> {
  await setSession(fastify.redis, phone, 'LEDGER_MENU', {})
  await sendList(
    phone,
    '📒 *Udhaar Book*\n\nManage customer credit and payments:',
    '📒 Select Action',
    [
      {
        title: 'Transactions',
        rows: [
          { id: 'ledger_add', title: '➕ Add Udhaar', description: 'Record new credit given to customer' },
          { id: 'ledger_pay', title: '💸 Record Payment', description: 'Customer paid back some amount' },
        ],
      },
      {
        title: 'View',
        rows: [
          { id: 'ledger_view', title: '👁 Customer Balance', description: 'Check balance & history' },
          { id: 'ledger_all', title: '📊 All Dues', description: 'List all customers with outstanding' },
        ],
      },
    ],
    '📒 Udhaar Book',
  )
}

// ── Handle ledger menu selection ──────────────────────────────────────────────

export async function handleLedgerMenu(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'interactive') {
    await showLedgerMenu(phone, fastify)
    return
  }

  const interactive = (message as MetaInteractiveMessage).interactive
  const replyId =
    interactive?.type === 'list_reply'
      ? interactive.list_reply.id
      : interactive?.type === 'button_reply'
        ? interactive.button_reply.id
        : ''

  if (replyId === 'ledger_add') {
    await setSession(fastify.redis, phone, 'LEDGER_ADD_NAME', {})
    await sendText(phone, '➕ *Add Udhaar*\n\nEnter the *customer name*:')
    return
  }

  if (replyId === 'ledger_pay') {
    await setSession(fastify.redis, phone, 'LEDGER_PAY_NAME', {})
    await sendText(phone, '💸 *Record Payment*\n\nEnter the *customer name*:')
    return
  }

  if (replyId === 'ledger_view') {
    await setSession(fastify.redis, phone, 'LEDGER_VIEW_NAME', {})
    await sendText(phone, '👁 *View Customer*\n\nEnter the *customer name*:')
    return
  }

  if (replyId === 'ledger_all') {
    await showAllDues(phone, fastify)
    return
  }

  await showLedgerMenu(phone, fastify)
}

// ── Show all dues ─────────────────────────────────────────────────────────────

async function showAllDues(phone: string, fastify: FastifyInstance): Promise<void> {
  const customers = await prisma.ledgerCustomer.findMany({
    where: { ownerPhone: phone, outstanding: { gt: 0 } },
    orderBy: { outstanding: 'desc' },
    take: 15,
  })

  if (customers.length === 0) {
    await sendText(phone, '🎉 *All Clear!*\n\nNo outstanding dues at the moment.')
    await resetSession(fastify.redis, phone)
    return
  }

  const total = customers.reduce((sum, c) => sum + c.outstanding, 0)

  const lines = [
    `📊 *OUTSTANDING DUES*`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    ...customers.map((c, i) => `${i + 1}. *${c.name}*: ${fmt(c.outstanding)}`),
    ``,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `💰 *Total: ${fmt(total)}*`,
    ...(customers.length === 15 ? [`\n_Showing top 15 by amount_`] : []),
  ]

  await sendText(phone, lines.join('\n'))
  await resetSession(fastify.redis, phone)
}

// ── Add Udhaar: Step 1 — customer name ───────────────────────────────────────

export async function handleLedgerAddName(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'text') {
    await sendText(phone, 'Please type the customer name:')
    return
  }

  const name = (message as MetaTextMessage).text.body.trim()
  if (name.length < 2 || name.length > 100) {
    await sendText(phone, '❌ Please enter a valid name (2–100 characters).')
    return
  }

  await setSession(fastify.redis, phone, 'LEDGER_ADD_AMOUNT', { ledgerCustomerName: name })
  await sendText(phone, `👤 Customer: *${name}*\n\n💰 Enter the *udhaar amount* in ₹:\n_(e.g. 45000)_`)
}

// ── Add Udhaar: Step 2 — amount ───────────────────────────────────────────────

export async function handleLedgerAddAmount(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'text') {
    await sendText(phone, '💰 Please type the amount in ₹ (e.g. 45000):')
    return
  }

  const text = (message as MetaTextMessage).text.body.trim().replace(/,/g, '')
  const amount = parseFloat(text)

  if (isNaN(amount) || amount <= 0 || amount > 10_000_000) {
    await sendText(phone, '❌ Please enter a valid amount (e.g. 45000).')
    return
  }

  const amountPaise = Math.round(amount * PAISE)
  const session = await getSession(fastify.redis, phone)
  await setSession(fastify.redis, phone, 'LEDGER_ADD_DESC', {
    ...session?.data,
    ledgerAmountPaise: amountPaise,
  })

  await sendText(
    phone,
    `✅ Amount: *${fmt(amountPaise)}*\n\n📝 Enter a *description* (item given):\n_(e.g. Gold ring 8g, 1 chain) — or type *skip*_`,
  )
}

// ── Add Udhaar: Step 3 — description → save ──────────────────────────────────

export async function handleLedgerAddDesc(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'text') {
    await sendText(phone, '📝 Please type a description or *skip*:')
    return
  }

  const text = (message as MetaTextMessage).text.body.trim()
  const description = text.toLowerCase() === 'skip' ? null : text.slice(0, 200)

  const session = await getSession(fastify.redis, phone)
  const name = session?.data?.ledgerCustomerName as string | undefined
  const amountPaise = session?.data?.ledgerAmountPaise as number | undefined

  if (!name || !amountPaise) {
    await sendText(phone, '⚠️ Session expired. Please start again from the Udhaar Book menu.')
    await resetSession(fastify.redis, phone)
    return
  }

  const customer = await prisma.ledgerCustomer.upsert({
    where: { ownerPhone_name: { ownerPhone: phone, name } },
    create: { ownerPhone: phone, name, outstanding: amountPaise },
    update: { outstanding: { increment: amountPaise } },
  })

  await prisma.ledgerTransaction.create({
    data: { customerId: customer.id, type: 'CREDIT', amount: amountPaise, description },
  })

  const updated = await prisma.ledgerCustomer.findUnique({ where: { id: customer.id } })

  const lines = [
    `✅ *Udhaar Recorded*`,
    ``,
    `👤 Customer: *${name}*`,
    `💰 Added: *${fmt(amountPaise)}*`,
    ...(description ? [`📝 Item: ${description}`] : []),
    ``,
    `📊 Total Outstanding: *${fmt(updated!.outstanding)}*`,
  ]

  await sendText(phone, lines.join('\n'))
  await resetSession(fastify.redis, phone)
}

// ── Record Payment: Step 1 — customer name ───────────────────────────────────

export async function handleLedgerPayName(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'text') {
    await sendText(phone, 'Please type the customer name:')
    return
  }

  const name = (message as MetaTextMessage).text.body.trim()

  const customer = await prisma.ledgerCustomer.findFirst({
    where: { ownerPhone: phone, name: { contains: name, mode: 'insensitive' } },
    orderBy: { outstanding: 'desc' },
  })

  if (!customer) {
    await sendText(
      phone,
      `❌ No customer found matching *"${name}"*.\n\nCheck the name and try again, or type *menu* to go back.`,
    )
    return
  }

  await setSession(fastify.redis, phone, 'LEDGER_PAY_AMOUNT', {
    ledgerCustomerName: customer.name,
    ledgerCustomerId: customer.id,
  })

  await sendText(
    phone,
    `👤 *${customer.name}*\n💳 Outstanding: *${fmt(customer.outstanding)}*\n\n💸 Enter the *payment amount* in ₹:`,
  )
}

// ── Record Payment: Step 2 — amount → save ───────────────────────────────────

export async function handleLedgerPayAmount(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'text') {
    await sendText(phone, '💸 Please type the payment amount in ₹ (e.g. 20000):')
    return
  }

  const text = (message as MetaTextMessage).text.body.trim().replace(/,/g, '')
  const amount = parseFloat(text)

  if (isNaN(amount) || amount <= 0 || amount > 10_000_000) {
    await sendText(phone, '❌ Please enter a valid amount (e.g. 20000).')
    return
  }

  const session = await getSession(fastify.redis, phone)
  const customerId = session?.data?.ledgerCustomerId as string | undefined
  const customerName = session?.data?.ledgerCustomerName as string | undefined

  if (!customerId || !customerName) {
    await sendText(phone, '⚠️ Session expired. Please start again from the Udhaar Book menu.')
    await resetSession(fastify.redis, phone)
    return
  }

  const amountPaise = Math.round(amount * PAISE)

  await prisma.ledgerCustomer.update({
    where: { id: customerId },
    data: { outstanding: { decrement: amountPaise } },
  })

  await prisma.ledgerTransaction.create({
    data: { customerId, type: 'PAYMENT', amount: amountPaise },
  })

  const updated = await prisma.ledgerCustomer.findUnique({ where: { id: customerId } })
  const remaining = updated!.outstanding

  const statusLine =
    remaining > 0
      ? `📊 Remaining Balance: *${fmt(remaining)}*`
      : remaining === 0
        ? `🎉 Account *fully settled!*`
        : `🎉 Account settled! (*${fmt(Math.abs(remaining))}* advance paid)`

  const lines = [
    `✅ *Payment Recorded*`,
    ``,
    `👤 Customer: *${customerName}*`,
    `💸 Paid: *${fmt(amountPaise)}*`,
    ``,
    statusLine,
  ]

  await sendText(phone, lines.join('\n'))
  await resetSession(fastify.redis, phone)
}

// ── View Customer Balance ─────────────────────────────────────────────────────

export async function handleLedgerViewName(
  message: MetaMessage,
  phone: string,
  fastify: FastifyInstance,
): Promise<void> {
  if (message.type !== 'text') {
    await sendText(phone, 'Please type the customer name:')
    return
  }

  const name = (message as MetaTextMessage).text.body.trim()

  const customer = await prisma.ledgerCustomer.findFirst({
    where: { ownerPhone: phone, name: { contains: name, mode: 'insensitive' } },
    include: {
      transactions: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  })

  if (!customer) {
    await sendText(
      phone,
      `❌ No customer found matching *"${name}"*.\n\nCheck the name and try again, or type *menu* to go back.`,
    )
    return
  }

  const txLines = customer.transactions.map((tx) => {
    const sign = tx.type === 'CREDIT' ? '🔴 +' : '🟢 -'
    const date = tx.createdAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' })
    const desc = tx.description ? ` (${tx.description})` : ''
    return `${sign}${fmt(tx.amount)}${desc} · ${date}`
  })

  const lines = [
    `👤 *${customer.name}*`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `💳 Outstanding: *${fmt(customer.outstanding)}*`,
    ``,
    `📜 *Recent transactions:*`,
    ...(txLines.length > 0 ? txLines : [`_No transactions yet_`]),
  ]

  await sendText(phone, lines.join('\n'))
  await resetSession(fastify.redis, phone)
}
