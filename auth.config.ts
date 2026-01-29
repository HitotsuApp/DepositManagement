import type { NextAuthConfig } from "next-auth"
import Google from "next-auth/providers/google"

export const authConfig = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  callbacks: {
    signIn: async ({ user, account, profile }) => {
      // メールアドレスが @自社ドメイン.com で終わるユーザーのみログインを許可
      const email = user?.email || profile?.email
      if (!email) {
        return false
      }
      
      // 自社ドメインで終わるかチェック
      const allowedDomain = "@hitotsunokai.jp"
      if (!email.endsWith(allowedDomain)) {
        return false
      }
      
      return true
    },
  },
  secret: process.env.AUTH_SECRET,
  trustHost: true, // Vercelなどのホスティング環境で必要
} satisfies NextAuthConfig
