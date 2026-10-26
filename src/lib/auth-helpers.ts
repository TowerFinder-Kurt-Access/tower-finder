import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Role } from '@prisma/client'

export interface AuthUser {
  id: number
  email: string
  name: string
  role: Role
}

/**
 * Get authenticated user from session.
 * Also rejects revoked sessions: deactivation, password reset, or password
 * change bump `sessionVersion` in the DB, so any older JWT fails here and in
 * middleware (see /api/auth/session-version).
 * Throws error if not authenticated.
 */
export async function getAuthUser(): Promise<AuthUser> {
  const session = await auth()

  if (!session?.user) {
    throw new Error('Unauthorized')
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: parseInt(session.user.id) },
    select: { sessionVersion: true, isActive: true, role: true, email: true, name: true },
  })

  if (!dbUser || !dbUser.isActive || dbUser.sessionVersion !== session.user.sessionVersion) {
    throw new Error('Unauthorized')
  }

  return {
    id: parseInt(session.user.id),
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role
  }
}

/**
 * Check if user has admin role
 */
export async function requireAdmin(): Promise<AuthUser> {
  const user = await getAuthUser()

  if (user.role !== Role.ADMIN) {
    throw new Error('Forbidden - Admin access required')
  }

  return user
}

/**
 * Extract initials from a name
 */
export function getInitials(name: string): string {
  if (!name) return '??'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}