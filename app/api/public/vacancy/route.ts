export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { neonHttpSql } from '@/lib/neonHttpSql'
import { fetchPublicVacancyFacilities } from '@/lib/publicVacancySql'
import { verifyVacancyApiKey } from '@/lib/publicVacancyAuth'
import {
  formatJapaneseUpdateDateLabel,
  type PublicVacancyResponse,
} from '@/lib/vacancy'

/** CDN / 共有キャッシュ TTL（24時間）。Neon への再集計を抑える。 */
const CACHE_MAX_AGE_SEC = 86400

export async function GET(request: Request) {
  if (!process.env.VACANCY_API_KEY?.trim()) {
    return NextResponse.json(
      { error: 'Public vacancy API is not configured' },
      { status: 503 }
    )
  }

  if (!verifyVacancyApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sql = neonHttpSql()
    const facilities = await fetchPublicVacancyFacilities(sql)
    const updatedAt = new Date()

    const body: PublicVacancyResponse = {
      updatedAt: updatedAt.toISOString(),
      updateDateLabel: formatJapaneseUpdateDateLabel(updatedAt),
      facilities,
    }

    const response = NextResponse.json(body)
    response.headers.set(
      'Cache-Control',
      `public, s-maxage=${CACHE_MAX_AGE_SEC}, stale-while-revalidate=3600`
    )
    return response
  } catch (error) {
    console.error('Failed to fetch public vacancy:', error)
    return NextResponse.json(
      { error: 'Failed to fetch public vacancy' },
      { status: 500 }
    )
  }
}
