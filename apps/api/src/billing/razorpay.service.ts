import axios from 'axios'
import { env } from '../config/env.js'

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
  const response = await axios.post(
    `${RAZORPAY_BASE}/payment_links`,
    {
      amount: params.amount * 100, // convert to paise
      currency: 'INR',
      description: params.description,
      customer: {
        contact: `+91${params.customerPhone}`,
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
}
