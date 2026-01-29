import { handlers } from "@/auth"

export const { GET, POST } = handlers

// 環境変数の検証
if (!process.env.AUTH_SECRET) {
  console.error("AUTH_SECRET is not set")
}

if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
  console.error("AUTH_GOOGLE_ID or AUTH_GOOGLE_SECRET is not set")
}
