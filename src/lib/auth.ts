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
import { issueLoginOtp, verifyLoginOtp } from "@/lib/otp"

// bcrypt hash of a random string: when the email is unknown we still run a
// bcrypt compare, so "unknown user" and "wrong password" take the same time.
const DUMMY_PASSWORD_HASH = "$2b$10$WYdJy.ttf/1JCTkv0hIX1u8uD/4qDRqwkXO1nQEJjXLKmWWsqjwfC"

// Surfaces the lockout state to the login page via result.code === 'account_locked'.
class AccountLockedError extends CredentialsSignin {
  code = "account_locked"
}

// Surfaces the two-step OTP state to the login page via result.code.
class OtpRequiredError extends CredentialsSignin {
  code = "otp_required"
}
class OtpCooldownError extends CredentialsSignin {
  code = "otp_cooldown"
}
class OtpSendFailedError extends CredentialsSignin {
  code = "otp_send_failed"
}
class OtpInvalidError extends CredentialsSignin {
  code = "otp_invalid"
}
class OtpExpiredError extends CredentialsSignin {
  code = "otp_expired"
}
class OtpMaxAttemptsError extends CredentialsSignin {
  code = "otp_max_attempts"
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        otp: { label: "One-time code", type: "text" }
      },
      async authorize(credentials, request) {
        const email = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined
        const otp = credentials?.otp as string | undefined
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

          const sessionUser = {
            id: user.id.toString(),
            email: user.email,
            name: user.name,
            role: user.role,
            sessionVersion: user.sessionVersion,
            passwordChangedAt: user.passwordChangedAt
          }

          // Single-step login unless the user opted into the OTP second factor
          // on their profile. twoFactorEnabled defaults false — nobody is
          // forced into the code step.
          if (!user.twoFactorEnabled) {
            await recordLoginEvent({ email, userId: user.id, type: LoginEventType.LOGIN_SUCCESS, ip, userAgent }).catch(() => {})
            await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } })
            return sessionUser
          }

          // -------- Second factor: email OTP (opt-in) --------
          if (!otp) {
            // Step 1: password passed — email a one-time code.
            let issued
            try {
              issued = await issueLoginOtp(user.email)
            } catch {
              // Email service down / no transport: keep the user out, don't crash.
              throw new OtpSendFailedError()
            }
            if (issued.cooldownRemainingSeconds > 0) {
              throw new OtpCooldownError()
            }
            await recordLoginEvent({ email, userId: user.id, type: LoginEventType.OTP_SENT, ip, userAgent }).catch(() => {})
            throw new OtpRequiredError()
          }

          // Step 2: verify the code (constant-time, consumes attempts).
          const verified = await verifyLoginOtp(user.email, otp)
          if (verified.ok === false) {
            if (verified.reason === "max_attempts" || verified.reason === "invalid") {
              // Failed codes count toward the existing lockout window.
              await recordLoginEvent({ email, userId: user.id, type: LoginEventType.OTP_FAILED, ip, userAgent }).catch(() => {})
              await recordLoginEvent({ email, userId: user.id, type: LoginEventType.LOGIN_FAILED, ip, userAgent }).catch(() => {})
            }
            if (verified.reason === "max_attempts") throw new OtpMaxAttemptsError()
            if (verified.reason === "invalid") throw new OtpInvalidError()
            throw new OtpExpiredError() // not_found / expired
          }

          await recordLoginEvent({ email, userId: user.id, type: LoginEventType.OTP_VERIFIED, ip, userAgent }).catch(() => {})
          await recordLoginEvent({ email, userId: user.id, type: LoginEventType.LOGIN_SUCCESS, ip, userAgent }).catch(() => {})
          await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } })

          return sessionUser
        } catch (err) {
          // Account lockout and OTP step codes propagate so the login page can
          // show the right state; transient DB errors become failed logins.
          if (err instanceof AccountLockedError
              || err instanceof OtpRequiredError
              || err instanceof OtpCooldownError
              || err instanceof OtpSendFailedError
              || err instanceof OtpInvalidError
              || err instanceof OtpExpiredError
              || err instanceof OtpMaxAttemptsError) throw err
          console.error("[auth] authorize failed:", err)
          return null
        }
      }
    })
  ]
})