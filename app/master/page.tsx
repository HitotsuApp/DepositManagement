import { Suspense } from 'react'
import MasterContent from './MasterContent'

export default function MasterPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <MasterContent />
    </Suspense>
  )
}
