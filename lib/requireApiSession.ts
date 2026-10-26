import { auth } from "@/auth"
import { NextResponse } from "next/server"

/**
 * 業務 API 用。ログイン済みの印が無ければ 401 を返す。
 * ログイン画面や OAuth へは転送しない。印があるときは null。
 */
export async function requireApiSession(): Promise<NextResponse | null> {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}
