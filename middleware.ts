import NextAuth from "next-auth"
import { NextResponse } from "next/server"
import { authConfig } from "@/auth.config"
import { checkApiRateLimit } from "@/lib/apiRateLimit"

const { auth } = NextAuth(authConfig)

export default auth(async (req) => {
  const { nextUrl } = req
  const pathname = nextUrl.pathname
  const isLoggedIn = !!req.auth

  const isAuthApi = pathname.startsWith("/api/auth")
  const isApiRoute = pathname.startsWith("/api")

  if (isApiRoute) {
    if (!isAuthApi) {
      const rate = await checkApiRateLimit(req)
      if (!rate.allowed) {
        return NextResponse.json(
          { error: "Too Many Requests" },
          {
            status: 429,
            headers: {
              "Retry-After": "60",
              "X-RateLimit-Limit": String(rate.limit),
              "X-RateLimit-Count": String(rate.count),
            },
          }
        )
      }

      if (!isLoggedIn) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }

    return NextResponse.next()
  }

  const isSignInPage = pathname.startsWith("/api/auth/signin")

  if (!isLoggedIn && !isAuthApi && !isSignInPage) {
    const signInUrl = new URL("/api/auth/signin", nextUrl.origin)
    signInUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    /*
     * 静的アセット以外のページと API にマッチ（/api/auth は middleware 内で個別処理）
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
