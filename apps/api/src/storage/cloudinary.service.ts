import { v2 as cloudinary } from 'cloudinary'
import { env } from '../config/env.js'
import { logger } from '../shared/logger.js'

// Ensure cloudinary is configured (in case this is called before plugin init)
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
})

/**
 * Upload a Buffer to Cloudinary and return the secure URL.
 * @param buffer - Image data
 * @param folder - Cloudinary folder path (e.g. 'jewel/source' | 'jewel/generated')
 * @param publicId - Optional stable public ID for deduplication
 */
export async function uploadBuffer(
  buffer: Buffer,
  folder: string,
  publicId?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        ...(publicId ? { public_id: publicId } : {}),
        resource_type: 'image',
        overwrite: true,
        format: 'jpg',
        quality: 90,
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('No upload result'))
        resolve(result.secure_url)
      },
    )
    uploadStream.end(buffer)
  })
}

/**
 * Upload from a remote URL (e.g., Kie AI result URL) to Cloudinary.
 */
export async function uploadFromUrl(url: string, folder: string): Promise<string> {
  const result = await cloudinary.uploader.upload(url, {
    folder,
    resource_type: 'image',
    format: 'jpg',
    quality: 90,
  })
  return result.secure_url
}

/**
 * Delete all images older than `maxAgeMs` in the given folders.
 * Uses Cloudinary Admin API search to find old resources, then bulk-deletes.
 */
export async function deleteOldImages(
  folders: string[],
  maxAgeMs: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs)
  const cutoffStr = cutoff.toISOString().replace('T', ' ').slice(0, 19) // "YYYY-MM-DD HH:MM:SS"
  let totalDeleted = 0

  for (const folder of folders) {
    try {
      let nextCursor: string | undefined
      const publicIds: string[] = []

      // Paginate through search results
      do {
        const search = cloudinary.search
          .expression(`folder:${folder}/* AND uploaded_at<${cutoffStr}`)
          .max_results(500)
          .sort_by('uploaded_at', 'asc')

        if (nextCursor) search.next_cursor(nextCursor)

        const result = await search.execute()
        for (const resource of result.resources ?? []) {
          publicIds.push(resource.public_id)
        }
        nextCursor = result.next_cursor
      } while (nextCursor)

      // Bulk delete in batches of 100 (Cloudinary limit)
      for (let i = 0; i < publicIds.length; i += 100) {
        const batch = publicIds.slice(i, i + 100)
        await cloudinary.api.delete_resources(batch)
      }

      if (publicIds.length > 0) {
        logger.info({ folder, count: publicIds.length }, 'Deleted old Cloudinary images')
      }
      totalDeleted += publicIds.length
    } catch (err) {
      logger.error({ err, folder }, 'Failed to clean up old Cloudinary images')
    }
  }

  return totalDeleted
}
