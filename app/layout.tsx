import type { Metadata } from 'next'
import './globals.css'
import { FacilityProvider } from '@/contexts/FacilityContext'

export const metadata: Metadata = {
  title: '預り金管理システム',
  description: '介護法人向け預り金管理Webアプリ',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body>
        <FacilityProvider>
          {children}
        </FacilityProvider>
      </body>
    </html>
  )
}

