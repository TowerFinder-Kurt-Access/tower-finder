import NextAuth, { CredentialsSignin } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { authConfig } from "./auth.config"
import { LoginEventType } from "@prisma/client"
import {
  isLockedOut,
  recordLoginEvent,
  requestIp,
} from "@/lib/login-security"

// bcrypt hash of a random string: when the email is unknown we still run a
// bcrypt compare, so "unknown user" and "wrong password" take the same time.
const DUMMY_PASSWORD_HASH = "$2b$10$WYdJy.ttf/1JCTkv0hIX1u8uD/4qDRqwkXO1nQEJjXLKmWWsqjwfC"

// Surfaces the lockout state to the login page via result.code === 'account_locked'.
class AccountLockedError extends CredentialsSignin {
  code = "account_locked"
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, request) {
        const email = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined
        if (!email || !password) return null

        const ip = requestIp(request)
        const userAgent = request?.headers.get("user-agent") ?? null

        try {
          // Lock accounts for 15 minutes after 5 wrong attempts.
          if (await isLockedOut(email)) {
            await recordLoginEvent({ email, type: LoginEventType.LOGIN_LOCKED, ip, userAgent }).catch(() => {})
            throw new AccountLockedError()
          }

          const user = await prisma.user.findUnique({ where: { email } })
          const passwordValid = await bcrypt.compare(password, user?.password ?? DUMMY_PASSWORD_HASH)

          if (!user || !user.isActive || !passwordValid) {
            await recordLoginEvent({ email, userId: user?.id, type: LoginEventType.LOGIN_FAILED, ip, userAgent }).catch(() => {})
            return null
          }

          await recordLoginEvent({ email, userId: user.id, type: LoginEventType.LOGIN_SUCCESS, ip, userAgent }).catch(() => {})
          await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } })

          return {
            id: user.id.toString(),
            email: user.email,
            name: user.name,
            role: user.role,
            sessionVersion: user.sessionVersion,
            passwordChangedAt: user.passwordChangedAt
          }
        } catch (err) {
          // Account lockout propagates so the login page can show it.
          if (err instanceof AccountLockedError) throw err
          // Transient DB errors become failed logins, not a 500 Configuration.
          console.error("[auth] authorize failed:", err)
          return null
        }
      }
    })
  ]
})