import MainLayout from '@/components/MainLayout'

/**
 * MainLayout はここで1回だけマウントし、SPA 内遷移で Sidebar を再フェッチしない。
 */
export default function MainGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <MainLayout>{children}</MainLayout>
}
