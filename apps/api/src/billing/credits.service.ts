import { prisma, type Prisma } from '@jewel/database'
import { InsufficientCreditsError } from '../shared/errors.js'

/**
 * Check if a user has at least `required` credits.
 */
export async function hasCredits(userId: string, required = 1): Promise<boolean> {
  const credit = await prisma.credit.findUnique({ where: { userId } })
  return (credit?.balance ?? 0) >= required
}

/**
 * Atomically deduct `amount` credits.
 * Throws InsufficientCreditsError if balance is too low.
 */
export async function deductCredit(userId: string, amount = 1): Promise<void> {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const credit = await tx.credit.findUnique({ where: { userId } })
    if (!credit || credit.balance < amount) {
      throw new InsufficientCreditsError()
    }
    await tx.credit.update({
      where: { userId },
      data: {
        balance: { decrement: amount },
        lifetimeUsed: { increment: amount },
      },
    })
  })
}

/**
 * Add credits (from top-up or subscription renewal).
 */
export async function addCredits(userId: string, amount: number): Promise<void> {
  await prisma.credit.update({
    where: { userId },
    data: { balance: { increment: amount } },
  })
}

/**
 * Get current credit balance.
 */
export async function getCreditBalance(userId: string): Promise<number> {
  const credit = await prisma.credit.findUnique({ where: { userId } })
  return credit?.balance ?? 0
}
