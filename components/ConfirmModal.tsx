'use client'

import type { ReactNode } from 'react'
import Modal from '@/components/Modal'

export interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  onConfirm: () => void | Promise<void>
  children: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  confirmClassName?: string
  isSubmitting?: boolean
}

/**
 * マスター画面の利用者終了確認などと同様、共通の Modal で確認を取る。
 */
export default function ConfirmModal({
  isOpen,
  onClose,
  title,
  onConfirm,
  children,
  confirmLabel = '確定',
  cancelLabel = 'キャンセル',
  confirmClassName =
    'flex-1 px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed',
  isSubmitting = false,
}: ConfirmModalProps) {
  const handleClose = () => {
    if (isSubmitting) return
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} maxHeight="85vh">
      <div className="space-y-4">
        <div className="text-gray-700 space-y-2 text-sm">{children}</div>
        <div className="flex gap-4 pt-2 border-t">
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={isSubmitting}
            className={confirmClassName}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
