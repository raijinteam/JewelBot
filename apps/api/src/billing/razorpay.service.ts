import axios from 'axios'
import { env } from '../config/env.js'
import { logger } from '../shared/logger.js'

const RAZORPAY_BASE = 'https://api.razorpay.com/v1'

function authHeader() {
  const token = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')
  return { Authorization: `Basic ${token}` }
}

export interface PaymentLinkResult {
  id: string
  short_url: string
}

export async function createPaymentLink(params: {
  amount: number       // in rupees (will be converted to paise)
  customerPhone: string
  planName: string
  description: string
}): Promise<PaymentLinkResult> {
  try {
    const response = await axios.post(
      `${RAZORPAY_BASE}/payment_links`,
      {
        amount: params.amount * 100, // convert to paise
        currency: 'INR',
        description: params.description,
        customer: {
          contact: params.customerPhone.startsWith('91') ? `+${params.customerPhone}` : `+91${params.customerPhone}`,
        },
        notify: {
          sms: true,
          whatsapp: false,
        },
        reminder_enable: true,
        notes: {
          phone: params.customerPhone,
          plan: params.planName,
        },
        callback_url: `${env.APP_URL}/razorpay/webhook`,
        callback_method: 'get',
      },
      { headers: authHeader() },
    )
    return { id: response.data.id, short_url: response.data.short_url }
  } catch (err: any) {
    logger.error({ err: err.response?.data ?? err.message, phone: params.customerPhone, plan: params.planName }, 'Razorpay payment link creation failed')
    throw err
  }
}
