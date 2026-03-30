import { prisma } from '@jewel/database'
import { FREE_TIER_LIFETIME_CREDITS } from '../config/constants.js'

/**
 * Find or create a user by phone number.
 * Also ensures Credit and Subscription rows exist (idempotent).
 */
export async function findOrCreateUser(phone: string, name?: string) {
  let user = await prisma.user.findUnique({ where: { phone } })

  if (!user) {
    user = await prisma.user.create({
      data: {
        phone,
        name: name ?? null,
        credits: {
          create: { balance: FREE_TIER_LIFETIME_CREDITS },
        },
        subscription: {
          create: { plan: 'FREE', status: 'ACTIVE' },
        },
      },
    })
  }

  return user
}

export async function getUserWithCredits(phone: string) {
  return prisma.user.findUnique({
    where: { phone },
    include: { credits: true, subscription: true },
  })
}
