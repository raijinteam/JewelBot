import type { FastifyInstance } from 'fastify'
import type {
  MetaWebhookPayload,
  MetaMessage,
  MetaTextMessage,
  MetaImageMessage,
  MetaInteractiveMessage,
} from '../whatsapp/wa.types.js'
import { markRead } from '../whatsapp/wa.messages.js'
import { getSession } from '../session/session.service.js'
import { STATES } from '../config/constants.js'
import { handleIdle, handleIdleInteractive } from '../handlers/idle.handler.js'
import { handleAwaitingImage } from '../handlers/awaiting-image.handler.js'
import { handleAnalyzing } from '../handlers/analyzing.handler.js'
import { handleAwaitingTemplate } from '../handlers/awaiting-template.handler.js'
import { handleAwaitingAspectRatio } from '../handlers/awaiting-aspect-ratio.handler.js'
import { handleAwaitingConfirmation } from '../handlers/awaiting-confirmation.handler.js'
import { handleProcessing } from '../handlers/processing.handler.js'
import {
  handleBillingMetal,
  handleBillingWeight,
  handleBillingMaking,
  handleBillingStone,
  handleBillingDone,
} from '../handlers/billing-calc.handler.js'
import {
  handleInvoiceCustomerName,
  handleInvoiceCustomerGstin,
} from '../handlers/invoice.handler.js'
import {
  handleLedgerMenu,
  handleLedgerAddName,
  handleLedgerAddAmount,
  handleLedgerAddDesc,
  handleLedgerPayName,
  handleLedgerPayAmount,
  handleLedgerViewName,
} from '../handlers/ledger.handler.js'
import { handleUpgradeSelect } from '../handlers/upgrade.handler.js'
import {
  handleBizName,
  handleBizGstin,
  handleBizAddress,
  handleBizState,
  handleBizPhone,
} from '../handlers/business-profile.handler.js'
import {
  handleFestiveBrandLogo,
  handleFestiveBrandName,
  handleFestiveBrandPhone,
  handleFestiveConfirm,
  handleFestiveFestivalInput,
  handleFestiveProcessing,
} from '../handlers/festive-post.handler.js'
import {
  handleBatchCollecting,
  handleBatchTemplate,
  handleBatchAspectRatio,
  handleBatchConfirm,
  handleBatchProcessing,
} from '../handlers/batch-create.handler.js'
import { normalizePhone } from '../shared/utils.js'
import { logger } from '../shared/logger.js'

export async function routeWebhookPayload(
  payload: MetaWebhookPayload,
  fastify: FastifyInstance,
): Promise<void> {
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const value = change.value
      if (!value.messages?.length) continue

      for (const message of value.messages) {
        const phone = normalizePhone(message.from)
        const contactName = value.contacts?.[0]?.profile?.name

        // Mark as read immediately (best-effort, non-blocking)
        markRead(message.id).catch(() => undefined)

        try {
          await dispatchMessage(message, phone, contactName, fastify)
        } catch (err) {
          logger.error({ err, phone, messageType: message.type }, 'Error handling message')
        }
      }
    }
  }
}

async function dispatchMessage(
  message: MetaMessage,
  phone: string,
  contactName: string | undefined,
  fastify: FastifyInstance,
): Promise<void> {
  const session = await getSession(fastify.redis, phone)
  const state = session?.state ?? STATES.IDLE

  logger.debug({ phone, state, messageType: message.type }, 'Dispatching message')

  // Ignore delivery status updates
  if (message.type === 'audio' || message.type === 'document') {
    return
  }

  // Global cancel/menu command — works from any state
  if (message.type === 'text') {
    const text = (message as MetaTextMessage).text.body.trim().toLowerCase()
    if (['menu', 'cancel', 'exit', 'home', 'hi', 'hello', 'start'].includes(text) && state !== STATES.IDLE) {
      return handleIdle(message, phone, contactName, fastify)
    }
  }

  switch (state) {
    case STATES.IDLE:
      if (message.type === 'interactive') {
        const interactive = (message as MetaInteractiveMessage).interactive
        const replyId =
          interactive?.type === 'button_reply'
            ? interactive.button_reply.id
            : interactive?.type === 'list_reply'
              ? interactive.list_reply.id
              : ''
        return handleIdleInteractive(replyId, phone, fastify)
      }
      return handleIdle(message, phone, contactName, fastify)

    case STATES.AWAITING_IMAGE:
      if (message.type === 'image') {
        return handleAwaitingImage(message as MetaImageMessage, phone, fastify)
      }
      // If they send text while waiting for image, re-prompt
      return handleIdle(message, phone, contactName, fastify)

    case STATES.ANALYZING:
      return handleAnalyzing(phone, fastify)

    case STATES.AWAITING_TEMPLATE:
      if (message.type === 'interactive') {
        return handleAwaitingTemplate(message as MetaInteractiveMessage, phone, fastify)
      }
      break

    case STATES.AWAITING_ASPECT_RATIO:
      if (message.type === 'interactive') {
        return handleAwaitingAspectRatio(message as MetaInteractiveMessage, phone, fastify)
      }
      break

    case STATES.AWAITING_CONFIRMATION:
      if (message.type === 'interactive') {
        return handleAwaitingConfirmation(message as MetaInteractiveMessage, phone, fastify)
      }
      break

    case STATES.PROCESSING:
      return handleProcessing(phone, fastify)

    case STATES.BILLING_METAL:
      return handleBillingMetal(message, phone, fastify)

    case STATES.BILLING_WEIGHT:
      return handleBillingWeight(message, phone, fastify)

    case STATES.BILLING_MAKING:
      return handleBillingMaking(message, phone, fastify)

    case STATES.BILLING_STONE:
      return handleBillingStone(message, phone, fastify)

    case STATES.BILLING_DONE:
      return handleBillingDone(message, phone, fastify)

    case STATES.INVOICE_CUSTOMER_NAME:
      return handleInvoiceCustomerName(message, phone, fastify)

    case STATES.INVOICE_CUSTOMER_GSTIN:
      return handleInvoiceCustomerGstin(message, phone, fastify)

    case STATES.LEDGER_MENU:
      return handleLedgerMenu(message, phone, fastify)

    case STATES.LEDGER_ADD_NAME:
      return handleLedgerAddName(message, phone, fastify)

    case STATES.LEDGER_ADD_AMOUNT:
      return handleLedgerAddAmount(message, phone, fastify)

    case STATES.LEDGER_ADD_DESC:
      return handleLedgerAddDesc(message, phone, fastify)

    case STATES.LEDGER_PAY_NAME:
      return handleLedgerPayName(message, phone, fastify)

    case STATES.LEDGER_PAY_AMOUNT:
      return handleLedgerPayAmount(message, phone, fastify)

    case STATES.LEDGER_VIEW_NAME:
      return handleLedgerViewName(message, phone, fastify)

    case STATES.UPGRADE_SELECT:
      return handleUpgradeSelect(message, phone, fastify)

    case STATES.BIZ_NAME:
      return handleBizName(message, phone, fastify)

    case STATES.BIZ_GSTIN:
      return handleBizGstin(message, phone, fastify)

    case STATES.BIZ_ADDRESS:
      return handleBizAddress(message, phone, fastify)

    case STATES.BIZ_STATE:
      return handleBizState(message, phone, fastify)

    case STATES.BIZ_PHONE:
      return handleBizPhone(message, phone, fastify)

    case STATES.FESTIVE_BRAND_LOGO:
      return handleFestiveBrandLogo(message, phone, fastify)

    case STATES.FESTIVE_BRAND_NAME:
      return handleFestiveBrandName(message, phone, fastify)

    case STATES.FESTIVE_BRAND_PHONE:
      return handleFestiveBrandPhone(message, phone, fastify)

    case STATES.FESTIVE_CONFIRM:
      return handleFestiveConfirm(message, phone, fastify)

    case STATES.FESTIVE_FESTIVAL_INPUT:
      return handleFestiveFestivalInput(message, phone, fastify)

    case STATES.FESTIVE_PROCESSING:
      return handleFestiveProcessing(phone, fastify)

    case STATES.BATCH_COLLECTING:
      return handleBatchCollecting(message, phone, fastify)

    case STATES.BATCH_TEMPLATE:
      return handleBatchTemplate(message, phone, fastify)

    case STATES.BATCH_ASPECT_RATIO:
      return handleBatchAspectRatio(message, phone, fastify)

    case STATES.BATCH_CONFIRM:
      return handleBatchConfirm(message, phone, fastify)

    case STATES.BATCH_PROCESSING:
      return handleBatchProcessing(phone, fastify)

    default:
      return handleIdle(message, phone, contactName, fastify)
  }
}
