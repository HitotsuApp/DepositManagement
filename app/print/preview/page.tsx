import { Suspense } from "react"
import PrintPreviewContent from "./PrintPreviewContent"

export default function PrintPreviewPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PrintPreviewContent />
    </Suspense>
  )
}
