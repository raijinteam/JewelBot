import { v2 as cloudinary } from 'cloudinary'
import { env } from '../config/env.js'

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
