import fp from 'fastify-plugin'
import { v2 as cloudinary } from 'cloudinary'
import { env } from '../config/env.js'
import { logger } from '../shared/logger.js'

declare module 'fastify' {
  interface FastifyInstance {
    cloudinary: typeof cloudinary
  }
}

export default fp(async (fastify) => {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  })

  logger.info('Cloudinary configured')
  fastify.decorate('cloudinary', cloudinary)
}, { name: 'cloudinary' })
