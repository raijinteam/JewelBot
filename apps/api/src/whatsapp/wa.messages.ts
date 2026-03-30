import { metaClient } from './wa.client.js'
import type { WaButton, WaListSection } from './wa.types.js'

/** Send a plain text message */
export async function sendText(to: string, body: string) {
  return metaClient.post('/messages', {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body },
  })
}

/** Send an image by URL */
export async function sendImage(to: string, imageUrl: string, caption?: string) {
  return metaClient.post('/messages', {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'image',
    image: { link: imageUrl, ...(caption ? { caption } : {}) },
  })
}

/** Send a button reply message (up to 3 buttons) */
export async function sendButtons(
  to: string,
  bodyText: string,
  buttons: WaButton[],
  headerText?: string,
  footerText?: string,
) {
  return metaClient.post('/messages', {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      ...(headerText ? { header: { type: 'text', text: headerText } } : {}),
      body: { text: bodyText },
      ...(footerText ? { footer: { text: footerText } } : {}),
      action: { buttons },
    },
  })
}

/** Send a list message (up to 10 rows across sections) */
export async function sendList(
  to: string,
  bodyText: string,
  buttonLabel: string,
  sections: WaListSection[],
  headerText?: string,
  footerText?: string,
) {
  return metaClient.post('/messages', {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      ...(headerText ? { header: { type: 'text', text: headerText } } : {}),
      body: { text: bodyText },
      ...(footerText ? { footer: { text: footerText } } : {}),
      action: { button: buttonLabel, sections },
    },
  })
}

/** Mark a message as read */
export async function markRead(messageId: string) {
  return metaClient.post('/messages', {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  })
}
