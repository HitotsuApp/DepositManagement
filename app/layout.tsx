import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '預かり金管理システム',
  description: '介護法人向け預かり金管理Webアプリ',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}

