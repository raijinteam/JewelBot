import axios from 'axios'
import { env } from '../config/env.js'
import { META_API_BASE } from '../config/constants.js'

/**
 * Download media bytes from Meta's CDN given a media ID.
 * Returns a Buffer of the image data.
 */
export async function downloadMediaBuffer(mediaId: string): Promise<Buffer> {
  // Step 1: resolve the download URL
  const infoRes = await axios.get(`${META_API_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${env.META_ACCESS_TOKEN}` },
  })
  const downloadUrl: string = infoRes.data.url

  // Step 2: download the actual bytes
  const mediaRes = await axios.get(downloadUrl, {
    headers: { Authorization: `Bearer ${env.META_ACCESS_TOKEN}` },
    responseType: 'arraybuffer',
  })

  return Buffer.from(mediaRes.data)
}
