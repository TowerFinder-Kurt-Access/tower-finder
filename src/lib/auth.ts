import NextAuth, { CredentialsSignin } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { authConfig } from "./auth.config"
import { LoginEventType } from "@prisma/client"
import {
  isLockedOut,
  isIpRateLimited,
  isLoginIpBudgetExhausted,
  isOtpAttemptBudgetExhausted,
  isOtpSendBudgetExhausted,
  recordLoginEvent,
  requestIp,
} from "@/lib/login-security"
import { isPolicyOutdated } from "@/lib/password-policy"
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
        const email = (credentials?.email as string | undefined)?.trim()
        const password = credentials?.password as string | undefined
        const otp = credentials?.otp as string | undefined
        if (!email || !password) return null

        const ip = requestIp(request)
        const userAgent = request?.headers.get("user-agent") ?? null

        try {
          // Per-IP throttle. Lockout below is per email; this bounds password
          // spraying across many accounts.
          if (isIpRateLimited(ip, 20, 60_000)) {
            await recordLoginEvent({ email, type: LoginEventType.LOGIN_LOCKED, ip, userAgent, metadata: { reason: "ip_rate_limit" } }).catch(() => {})
            return null
          }
          if (await isLoginIpBudgetExhausted(ip)) {
            await recordLoginEvent({ email, type: LoginEventType.LOGIN_LOCKED, ip, userAgent, metadata: { reason: "ip_budget" } }).catch(() => {})
            return null
          }

          // Lock accounts for 15 minutes after 5 wrong attempts.
          if (await isLockedOut(email)) {
            await recordLoginEvent({ email, type: LoginEventType.LOGIN_LOCKED, ip, userAgent }).catch(() => {})
            throw new AccountLockedError()
          }

          const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })

          // --- Granular password validation logging ---
          if (!user) {
            // Run bcrypt against dummy hash so timing is identical to wrong-password.
            await bcrypt.compare(password, DUMMY_PASSWORD_HASH)
            await recordLoginEvent({ email, type: LoginEventType.USER_NOT_FOUND, ip, userAgent, metadata: { reason: "no_account_for_email" } }).catch(() => {})
            await recordLoginEvent({ email, type: LoginEventType.LOGIN_FAILED, ip, userAgent }).catch(() => {})
            return null
          }

          if (!user.isActive) {
            await bcrypt.compare(password, user.password) // constant-time
            await recordLoginEvent({ email, userId: user.id, type: LoginEventType.ACCOUNT_INACTIVE, ip, userAgent, metadata: { reason: "account_deactivated" } }).catch(() => {})
            await recordLoginEvent({ email, userId: user.id, type: LoginEventType.LOGIN_FAILED, ip, userAgent }).catch(() => {})
            return null
          }

          const passwordValid = await bcrypt.compare(password, user.password)
          if (!passwordValid) {
            await recordLoginEvent({ email, userId: user.id, type: LoginEventType.WRONG_PASSWORD, ip, userAgent, metadata: { reason: "password_mismatch" } }).catch(() => {})
            await recordLoginEvent({ email, userId: user.id, type: LoginEventType.LOGIN_FAILED, ip, userAgent }).catch(() => {})
            return null
          }

          // Password valid from here on.
          // Read the policy version once at sign-in. A missing row is version 0.
          const passwordPolicy = await prisma.userPasswordPolicy.findUnique({
            where: { userId: user.id },
            select: { policyVersion: true },
          });

          const sessionUser = {
            id: user.id.toString(),
            email: user.email,
            name: user.name,
            role: user.role,
            sessionVersion: user.sessionVersion,
            passwordChangedAt: user.passwordChangedAt,
            mustChangePassword: user.mustChangePassword,
            passwordPolicyOutdated: isPolicyOutdated(passwordPolicy?.policyVersion),
            twoFactorEnabled: user.twoFactorEnabled,
          }

          // Password-only until the account activates 2FA. Accounts that have
          // not activated are pushed to the setup screen, not challenged with
          // a code they never opted into.
          if (!user.twoFactorEnabled) {
            await recordLoginEvent({ email, userId: user.id, type: LoginEventType.LOGIN_SUCCESS, ip, userAgent, metadata: { method: "password_only" } }).catch(() => {})
            await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } })
            return sessionUser
          }

          // -------- Second factor: email OTP, for activated accounts --------
          if (!otp) {
            // Step 1: password passed — email a one-time code.
            if (await isOtpSendBudgetExhausted(user.email)) {
              await recordLoginEvent({ email, userId: user.id, type: LoginEventType.OTP_COOLDOWN, ip, userAgent, metadata: { reason: "send_budget" } }).catch(() => {})
              throw new OtpCooldownError()
            }
            let issued
            try {
              issued = await issueLoginOtp(user.email)
            } catch (err) {
              // Email service down / no transport: keep the user out, don't crash.
              await recordLoginEvent({ email, userId: user.id, type: LoginEventType.OTP_DELIVERY_FAILED, ip, userAgent, metadata: { reason: "exception", error: String(err) } }).catch(() => {})
              throw new OtpSendFailedError()
            }
            if (issued.cooldownRemainingSeconds > 0) {
              await recordLoginEvent({ email, userId: user.id, type: LoginEventType.OTP_COOLDOWN, ip, userAgent, metadata: { cooldownRemainingSeconds: issued.cooldownRemainingSeconds } }).catch(() => {})
              throw new OtpCooldownError()
            }

            // Log the email delivery outcome from Resend.
            const dr = issued.deliveryResult;
            if (dr && !dr.ok) {
              // Resend rejected the email (quota, invalid address, domain not verified, etc.)
              await recordLoginEvent({ email, userId: user.id, type: LoginEventType.OTP_DELIVERY_FAILED, ip, userAgent, metadata: {
                reason: "resend_rejected",
                resendStatus: dr.resendStatus,
                resendError: dr.resendError,
                resendDetail: dr.resendDetail,
              } }).catch(() => {})
              // No code reached the user. Do not show a code box that cannot
              // be satisfied; surface the failure instead.
              throw new OtpSendFailedError()
            }
            await recordLoginEvent({ email, userId: user.id, type: LoginEventType.OTP_SENT, ip, userAgent, metadata: {
              resendStatus: dr?.resendStatus,
              resendId: dr?.resendId,
              devFallback: dr?.devFallback ?? false,
              noApiKey: dr?.noApiKey ?? false,
            } }).catch(() => {})

            throw new OtpRequiredError()
          }

          // Step 2: verify the code (constant-time, consumes attempts).
          if (await isOtpAttemptBudgetExhausted(user.email)) {
            await recordLoginEvent({ email, userId: user.id, type: LoginEventType.OTP_MAX_ATTEMPTS, ip, userAgent, metadata: { reason: "daily_budget" } }).catch(() => {})
            throw new OtpMaxAttemptsError()
          }
          const verified = await verifyLoginOtp(user.email, otp)
          if (verified.ok === false) {
            if (verified.reason === "max_attempts") {
              await recordLoginEvent({ email, userId: user.id, type: LoginEventType.OTP_MAX_ATTEMPTS, ip, userAgent, metadata: { reason: "max_attempts" } }).catch(() => {})
              await recordLoginEvent({ email, userId: user.id, type: LoginEventType.LOGIN_FAILED, ip, userAgent }).catch(() => {})
              throw new OtpMaxAttemptsError()
            }
            if (verified.reason === "invalid") {
              await recordLoginEvent({ email, userId: user.id, type: LoginEventType.OTP_FAILED, ip, userAgent, metadata: { reason: "code_mismatch" } }).catch(() => {})
              await recordLoginEvent({ email, userId: user.id, type: LoginEventType.LOGIN_FAILED, ip, userAgent }).catch(() => {})
              throw new OtpInvalidError()
            }
            // expired or not_found
            await recordLoginEvent({ email, userId: user.id, type: LoginEventType.OTP_EXPIRED, ip, userAgent, metadata: { reason: verified.reason } }).catch(() => {})
            throw new OtpExpiredError()
          }

          await recordLoginEvent({ email, userId: user.id, type: LoginEventType.OTP_VERIFIED, ip, userAgent, metadata: { method: "email_otp" } }).catch(() => {})
          await recordLoginEvent({ email, userId: user.id, type: LoginEventType.LOGIN_SUCCESS, ip, userAgent, metadata: { method: "email_otp" } }).catch(() => {})
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