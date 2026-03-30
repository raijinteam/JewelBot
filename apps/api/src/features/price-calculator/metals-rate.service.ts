import axios from 'axios'
import Redis from 'ioredis'
import { env } from '../../config/env.js'
import { logger } from '../../shared/logger.js'

const CACHE_KEY = 'metals:rates:inr'
const CACHE_TTL_SECONDS = 900 // 15 minutes

/**
 * India premium multiplier over international spot prices.
 * Accounts for import duty (~6%), GST (3%), and dealer premium (~1%).
 * Observed: Indian 24K ≈ 1.05× international spot in INR.
 */
const INDIA_GOLD_PREMIUM = 1.053
const INDIA_SILVER_PREMIUM = 1.05

const TROY_OZ_TO_GRAMS = 31.1035

export interface MetalRates {
  gold_per_gram_inr: number   // 24K pure gold per gram
  silver_per_gram_inr: number // pure silver per gram
  fetchedAt: string           // ISO timestamp
}

// Purity multipliers relative to 24K pure gold
export const GOLD_PURITY: Record<string, { label: string; factor: number }> = {
  gold_24k: { label: 'Gold 24K (99.9%)', factor: 1.0 },
  gold_22k: { label: 'Gold 22K (91.6%)', factor: 0.916 },
  gold_18k: { label: 'Gold 18K (75.0%)', factor: 0.75 },
}

export const SILVER_PURITY: Record<string, { label: string; factor: number }> = {
  silver_999: { label: 'Silver 999 (99.9%)', factor: 1.0 },
  silver_925: { label: 'Silver 925 (92.5%)', factor: 0.925 },
}

export const ALL_METALS = { ...GOLD_PURITY, ...SILVER_PURITY }

/** Helper: get USD→INR exchange rate */
async function getUsdToInr(): Promise<number> {
  const { data } = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 5000 })
  const rate = data?.rates?.INR
  if (!rate || typeof rate !== 'number') throw new Error('Invalid FX response')
  return rate
}

/**
 * Fetch live gold & silver rates in INR (Indian retail).
 *
 * Strategy (tries in order):
 * 1. Swissquote — free, no key, real-time forex feed (XAU/USD, XAG/USD)
 * 2. GoldAPI.io (if GOLD_API_KEY is set) — reliable paid/free tier
 * 3. Throws error if all sources fail (no hardcoded rates)
 */
async function fetchLiveRates(): Promise<MetalRates> {
  // ── Strategy 1: Swissquote forex feed (free, no key, reliable) ──────────
  try {
    const [goldRes, silverRes] = await Promise.all([
      axios.get('https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/XAU/USD', { timeout: 5000 }),
      axios.get('https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/XAG/USD', { timeout: 5000 }),
    ])

    // Extract mid-price from the first platform's premium spread profile
    const goldPrices = goldRes.data?.[0]?.spreadProfilePrices?.[0]
    const silverPrices = silverRes.data?.[0]?.spreadProfilePrices?.[0]

    if (goldPrices?.bid && silverPrices?.bid) {
      const goldPerOzUsd = (goldPrices.bid + goldPrices.ask) / 2
      const silverPerOzUsd = (silverPrices.bid + silverPrices.ask) / 2

      const usdToInr = await getUsdToInr()

      const goldPerGram = (goldPerOzUsd / TROY_OZ_TO_GRAMS) * usdToInr * INDIA_GOLD_PREMIUM
      const silverPerGram = (silverPerOzUsd / TROY_OZ_TO_GRAMS) * usdToInr * INDIA_SILVER_PREMIUM

      logger.info(
        { goldPerOzUsd: Math.round(goldPerOzUsd), silverPerOzUsd: Math.round(silverPerOzUsd * 100) / 100, usdToInr, goldPerGramInr: Math.round(goldPerGram), silverPerGramInr: Math.round(silverPerGram) },
        'Rates from Swissquote + FX',
      )

      return {
        gold_per_gram_inr: Math.round(goldPerGram),
        silver_per_gram_inr: Math.round(silverPerGram),
        fetchedAt: new Date().toISOString(),
      }
    }
    logger.warn('Swissquote returned unexpected format')
  } catch (err) {
    logger.warn({ err }, 'Swissquote fetch failed, trying next source')
  }

  // ── Strategy 2: GoldAPI.io (if key is set) ──────────────────────────────
  const goldApiKey = env.GOLD_API_KEY
  if (goldApiKey) {
    try {
      const [goldRes, silverRes] = await Promise.all([
        axios.get('https://www.goldapi.io/api/XAU/USD', {
          headers: { 'x-access-token': goldApiKey },
          timeout: 5000,
        }),
        axios.get('https://www.goldapi.io/api/XAG/USD', {
          headers: { 'x-access-token': goldApiKey },
          timeout: 5000,
        }),
      ])

      const goldPerOzUsd = goldRes.data?.price
      const silverPerOzUsd = silverRes.data?.price

      if (goldPerOzUsd && silverPerOzUsd) {
        const usdToInr = await getUsdToInr()

        logger.info({ goldPerOzUsd, silverPerOzUsd, usdToInr }, 'Rates from GoldAPI.io + FX')
        return {
          gold_per_gram_inr: Math.round((goldPerOzUsd / TROY_OZ_TO_GRAMS) * usdToInr * INDIA_GOLD_PREMIUM),
          silver_per_gram_inr: Math.round((silverPerOzUsd / TROY_OZ_TO_GRAMS) * usdToInr * INDIA_SILVER_PREMIUM),
          fetchedAt: new Date().toISOString(),
        }
      }
    } catch (err) {
      logger.warn({ err }, 'GoldAPI.io fetch failed')
    }
  }

  // ── All sources failed ────────────────────────────────────────────────────
  throw new Error('All metal rate APIs failed — cannot provide live rates')
}

/**
 * Get metal rates (cached in Redis for 15 min).
 * Returns null if all live sources fail and no cache exists.
 */
export async function getMetalRates(redis: Redis): Promise<MetalRates | null> {
  const cached = await redis.get(CACHE_KEY)
  if (cached) {
    return JSON.parse(cached) as MetalRates
  }

  try {
    const rates = await fetchLiveRates()
    await redis.setex(CACHE_KEY, CACHE_TTL_SECONDS, JSON.stringify(rates))
    return rates
  } catch (err) {
    logger.error({ err }, 'Failed to fetch metal rates')
    return null
  }
}

/**
 * Calculate price for a specific metal, weight, and making charge.
 */
export function calculatePrice(
  rates: MetalRates,
  metalKey: string,
  weightGrams: number,
  makingChargePercent: number,
): {
  metalRate: number
  metalCost: number
  makingCharge: number
  gst: number
  totalPrice: number
  metalLabel: string
  purityFactor: number
} {
  const isGold = metalKey.startsWith('gold_')
  const baseRatePerGram = isGold ? rates.gold_per_gram_inr : rates.silver_per_gram_inr
  const metal = ALL_METALS[metalKey]
  const purityFactor = metal?.factor ?? 1.0
  const metalLabel = metal?.label ?? metalKey

  const metalRate = Math.round(baseRatePerGram * purityFactor)
  const metalCost = metalRate * weightGrams
  const makingCharge = Math.round(metalCost * (makingChargePercent / 100))
  const subtotal = metalCost + makingCharge
  const gst = Math.round(subtotal * 0.03) // 3% GST on gold/silver jewelry in India
  const totalPrice = subtotal + gst

  return { metalRate, metalCost, makingCharge, gst, totalPrice, metalLabel, purityFactor }
}
