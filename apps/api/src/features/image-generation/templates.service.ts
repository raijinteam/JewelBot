import { prisma } from '@jewel/database'
import type { Plan } from '@jewel/database'

/**
 * Fetch templates compatible with a given jewel type and user plan.
 * Templates with compatibleTypes=['*'] always match.
 */
export async function getCompatibleTemplates(jewellType: string, userPlan: Plan) {
  const planOrder: Plan[] = ['FREE', 'SHOP', 'PRO', 'WHOLESALE']
  const userPlanIndex = planOrder.indexOf(userPlan)

  const allActive = await prisma.template.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })

  return allActive.filter((tpl) => {
    // Check plan access
    const tplPlanIndex = planOrder.indexOf(tpl.planRequired)
    if (tplPlanIndex > userPlanIndex) return false

    // Check jewel type compatibility
    return (
      tpl.compatibleTypes.includes('*') ||
      tpl.compatibleTypes.includes(jewellType.toLowerCase())
    )
  })
}

export async function getTemplateById(id: string) {
  return prisma.template.findUnique({ where: { id } })
}
