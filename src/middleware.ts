import { auth } from '@/lib/auth'

export default auth((req) => {
  const { pathname } = req.nextUrl

  // Public routes that don't require authentication
  const publicRoutes = ['/login']
  const publicApiRoutes = ['/api/auth']

  // Allow public routes
  if (publicRoutes.some(route => pathname === route || pathname.startsWith(route))) {
    return
  }

  // Allow public API routes
  if (publicApiRoutes.some(route => pathname.startsWith(route))) {
    return
  }

  // Check if user is authenticated
  const isLoggedIn = !!req.auth

  // Redirect to login if not authenticated
  if (!isLoggedIn) {
    // For API routes, return 401
    if (pathname.startsWith('/api/')) {
      return Response.json(
        { error: 'Unauthorized - Please login' },
        { status: 401 }
      )
    }

    // For page routes, redirect to login
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return Response.redirect(loginUrl)
  }

  // User is authenticated, continue
  return
})

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ]
}
