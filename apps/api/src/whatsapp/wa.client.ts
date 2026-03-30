import axios from 'axios'
import { env } from '../config/env.js'
import { META_API_BASE } from '../config/constants.js'
import { logger } from '../shared/logger.js'

const metaClient = axios.create({
  baseURL: `${META_API_BASE}/${env.META_PHONE_NUMBER_ID}`,
  headers: {
    Authorization: `Bearer ${env.META_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
})

metaClient.interceptors.response.use(
  (res) => res,
  (err) => {
    logger.error(
      { status: err.response?.status, data: err.response?.data },
      'Meta API error',
    )
    return Promise.reject(err)
  },
)

export { metaClient }
