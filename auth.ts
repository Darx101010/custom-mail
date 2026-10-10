import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  session: { strategy: "database" },
  trustHost: true,
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const u = await prisma.user.findUnique({ where: { email: user.email } });
      return !u?.banned;
    },
    async session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
