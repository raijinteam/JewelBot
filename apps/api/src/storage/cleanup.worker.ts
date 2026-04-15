import { env } from '../config/env.js'
import { CLOUDINARY_IMAGE_MAX_AGE_MS } from '../config/constants.js'
import { deleteOldImages } from './cloudinary.service.js'
import { logger } from '../shared/logger.js'

const CLEANUP_FOLDERS = ['jewel/source', 'jewel/generated', 'jewel/festive', 'jewel/videos']
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000 // every 6 hours

async function runCleanup(): Promise<void> {
  try {
    logger.info('Starting Cloudinary cleanup — deleting images older than 48h')
    const deleted = await deleteOldImages(CLEANUP_FOLDERS, CLOUDINARY_IMAGE_MAX_AGE_MS)
    logger.info({ totalDeleted: deleted }, 'Cloudinary cleanup complete')
  } catch (err) {
    logger.error({ err }, 'Cloudinary cleanup failed')
  }
}

export function startCleanupWorker(): void {
  // Run once on startup (after a short delay to let the server boot)
  setTimeout(runCleanup, 30_000)

  // Then repeat every 6 hours
  setInterval(runCleanup, CLEANUP_INTERVAL_MS)

  logger.info('Cleanup worker scheduled — runs every 6 hours')
}
