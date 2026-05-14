import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { db } from '@/lib/db'
import { comparePassword } from '@/lib/auth-utils'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required')
        }

        const user = await db.user.findUnique({
          where: { email: credentials.email },
          include: {
            role: { select: { name: true, permissions: true } },
            driver: { select: { id: true } },
          },
        })

        if (!user) {
          throw new Error('Invalid email or password')
        }

        if (!user.isActive) {
          throw new Error('Account is deactivated. Contact your administrator.')
        }

        if (!user.password) {
          throw new Error('No password set for this account')
        }

        // Compare password using bcrypt
        const isValid = await comparePassword(credentials.password, user.password)

        if (!isValid) {
          throw new Error('Invalid email or password')
        }

        // Parse permissions from JSON string
        let permissions: string[] = []
        try {
          permissions = JSON.parse(user.role.permissions)
        } catch {
          permissions = []
        }

        // Update last login
        await db.user.update({
          where: { id: user.id },
          data: { lastLogin: new Date() },
        })

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          avatar: user.avatar,
          roleName: user.role.name,
          permissions,
          driverId: user.driver?.id ?? null,
          isActive: user.isActive,
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, user }) {
      // Initial sign in — add user data to the token
      if (user) {
        token.userId = user.id
        token.email = user.email
        token.name = user.name
        token.roleName = user.roleName
        token.permissions = user.permissions
        token.driverId = user.driverId
      }
      return token
    },
    async session({ session, token }) {
      // Expose user data to the client session
      if (session.user && token) {
        (session.user as Record<string, unknown>).id = token.userId
        (session.user as Record<string, unknown>).roleName = token.roleName
        (session.user as Record<string, unknown>).permissions = token.permissions
        (session.user as Record<string, unknown>).driverId = token.driverId
      }
      return session
    },
  },
  pages: {
    signIn: undefined, // Let the app handle the login page
  },
  secret: process.env.NEXTAUTH_SECRET,
}
