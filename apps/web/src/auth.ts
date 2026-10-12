import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@voidlog/db";
import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

/**
 * Auth.js configuration (ADR-007). Database session strategy via
 * PrismaAdapter so sessions survive server restarts and are queryable for
 * other purposes.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    Discord({
      // Discord sends `iss=https://discord.com` on the OAuth callback (RFC 9207),
      // but the built-in provider declares no issuer and Auth.js falls back to
      // "https://authjs.dev", failing with "unexpected iss (issuer) response
      // parameter value". Setting it makes the issuer check pass.
      issuer: "https://discord.com",
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
