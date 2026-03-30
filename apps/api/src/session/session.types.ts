import type { SessionState, SessionData } from '@jewel/shared-types'

export interface Session {
  phone: string
  state: SessionState
  data: SessionData
  updatedAt: number // unix ms
}

export type { SessionState, SessionData }
