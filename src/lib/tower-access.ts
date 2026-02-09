import { prisma } from '@/lib/prisma'
import { Role } from '@prisma/client'
import { Prisma } from '@prisma/client'

/**
 * Build where clause for tower queries based on user role
 */
export function buildTowerAccessFilter(
  userId: number,
  userRole: Role,
  additionalFilters?: Prisma.TowerWhereInput
): Prisma.TowerWhereInput {

  // Admins see everything
  if (userRole === Role.ADMIN) {
    return additionalFilters || {}
  }

  // Callers only see assigned towers
  const callerFilter: Prisma.TowerWhereInput = {
    assignments: {
      some: {
        userId: userId
      }
    }
  }

  // Combine with additional filters
  if (additionalFilters) {
    return {
      AND: [callerFilter, additionalFilters]
    }
  }

  return callerFilter
}

/**
 * Check if user has access to a specific tower
 */
export async function canAccessTower(
  userId: number,
  userRole: Role,
  towerId: number
): Promise<boolean> {
  if (userRole === Role.ADMIN) {
    return true
  }

  const assignment = await prisma.towerAssignment.findUnique({
    where: {
      userId_towerId: {
        userId,
        towerId
      }
    }
  })

  return assignment !== null
}
