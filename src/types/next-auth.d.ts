import { Role } from "@prisma/client"
import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: Role
      email: string
      name: string
      sessionVersion: number
      mustChangePassword?: boolean
      forcedPasswordChange?: boolean
    } & DefaultSession["user"]
  }

  interface User {
    role: Role
    passwordChangedAt: Date
    mustChangePassword: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: Role
    sessionVersion: number
    mustChangePassword: boolean
    forcedPasswordChange: boolean
  }
}