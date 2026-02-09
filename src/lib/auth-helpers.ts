import { auth } from '@/lib/auth'
import { Role } from '@prisma/client'

export interface AuthUser {
  id: number
  email: string
  name: string
  role: Role
}

/**
 * Get authenticated user from session
 * Throws error if not authenticated
 */
export async function getAuthUser(): Promise<AuthUser> {
  const session = await auth()

  if (!session?.user) {
    throw new Error('Unauthorized')
  }

  return {
    id: parseInt(session.user.id),
    email: session.user.email,
    name: session.user.name,
    role: session.user.role
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
 * Get user from request headers (set by middleware)
 */
export function getUserFromHeaders(request: Request): AuthUser | null {
  const headers = request.headers
  const userId = headers.get('x-user-id')
  const userRole = headers.get('x-user-role')

  if (!userId || !userRole) {
    return null
  }

  return {
    id: parseInt(userId),
    role: userRole as Role,
    email: '', // Not available from headers
    name: ''   // Not available from headers
  }
}
