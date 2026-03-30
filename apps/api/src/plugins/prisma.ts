import fp from 'fastify-plugin'
import { prisma } from '@jewel/database'
import { logger } from '../shared/logger.js'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: typeof prisma
  }
}

export default fp(async (fastify) => {
  await prisma.$connect()
  logger.info('PostgreSQL connected via Prisma')

  fastify.decorate('prisma', prisma)

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect()
  })
}, { name: 'prisma' })
