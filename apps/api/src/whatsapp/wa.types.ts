// ─── Incoming Webhook Payload (Meta Cloud API v21) ───────────────────────────

export interface MetaWebhookPayload {
  object: string
  entry: MetaEntry[]
}

export interface MetaEntry {
  id: string
  changes: MetaChange[]
}

export interface MetaChange {
  value: MetaChangeValue
  field: string
}

export interface MetaChangeValue {
  messaging_product: string
  metadata: { display_phone_number: string; phone_number_id: string }
  contacts?: MetaContact[]
  messages?: MetaMessage[]
  statuses?: MetaStatus[]
}

export interface MetaContact {
  profile: { name: string }
  wa_id: string
}

export type MetaMessage =
  | MetaTextMessage
  | MetaImageMessage
  | MetaInteractiveMessage
  | MetaAudioMessage
  | MetaDocumentMessage

export interface MetaBaseMessage {
  from: string
  id: string
  timestamp: string
  type: string
}

export interface MetaTextMessage extends MetaBaseMessage {
  type: 'text'
  text: { body: string }
}

export interface MetaImageMessage extends MetaBaseMessage {
  type: 'image'
  image: { id: string; mime_type: string; sha256: string; caption?: string }
}

export interface MetaInteractiveMessage extends MetaBaseMessage {
  type: 'interactive'
  interactive:
    | { type: 'button_reply'; button_reply: { id: string; title: string } }
    | { type: 'list_reply'; list_reply: { id: string; title: string; description?: string } }
}

export interface MetaAudioMessage extends MetaBaseMessage {
  type: 'audio'
  audio: { id: string; mime_type: string }
}

export interface MetaDocumentMessage extends MetaBaseMessage {
  type: 'document'
  document: { id: string; mime_type: string; filename?: string }
}

export interface MetaStatus {
  id: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: string
  recipient_id: string
}

// ─── Outgoing Message Payloads ────────────────────────────────────────────────

export interface WaListRow {
  id: string
  title: string
  description?: string
}

export interface WaListSection {
  title: string
  rows: WaListRow[]
}

export interface WaButton {
  type: 'reply'
  reply: { id: string; title: string }
}
