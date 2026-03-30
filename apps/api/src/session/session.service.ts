import type Redis from 'ioredis'
import { SESSION_TTL_SECONDS } from '../config/constants.js'
import type { Session, SessionState, SessionData } from './session.types.js'

function sessionKey(phone: string): string {
  return `session:${phone}`
}

/** Load session from Redis. Returns null if not found / expired. */
export async function getSession(redis: Redis, phone: string): Promise<Session | null> {
  const raw = await redis.get(sessionKey(phone))
  if (!raw) return null
  try {
    return JSON.parse(raw) as Session
  } catch {
    return null
  }
}

/** Write (create or update) a session with refreshed TTL. */
export async function setSession(
  redis: Redis,
  phone: string,
  state: SessionState,
  data: SessionData = {},
): Promise<void> {
  const session: Session = {
    phone,
    state,
    data,
    updatedAt: Date.now(),
  }
  await redis.setex(sessionKey(phone), SESSION_TTL_SECONDS, JSON.stringify(session))
}

/** Merge partial data into existing session (preserves other fields). */
export async function updateSessionData(
  redis: Redis,
  phone: string,
  patch: Partial<SessionData>,
): Promise<void> {
  const existing = await getSession(redis, phone)
  if (!existing) return
  const updated: Session = {
    ...existing,
    data: { ...existing.data, ...patch },
    updatedAt: Date.now(),
  }
  await redis.setex(sessionKey(phone), SESSION_TTL_SECONDS, JSON.stringify(updated))
}

/** Transition to a new state, optionally merging data. */
export async function transitionState(
  redis: Redis,
  phone: string,
  newState: SessionState,
  dataPatch?: Partial<SessionData>,
): Promise<void> {
  const existing = await getSession(redis, phone)
  const mergedData = { ...(existing?.data ?? {}), ...(dataPatch ?? {}) }
  await setSession(redis, phone, newState, mergedData)
}

/** Reset session to IDLE (clear all data). */
export async function resetSession(redis: Redis, phone: string): Promise<void> {
  await setSession(redis, phone, 'IDLE', {})
}

/** Delete session key entirely. */
export async function deleteSession(redis: Redis, phone: string): Promise<void> {
  await redis.del(sessionKey(phone))
}
