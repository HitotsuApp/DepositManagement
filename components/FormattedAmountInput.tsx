'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'

type Props = {
  value: string // カンマなしの数値文字列（DB/送信用）
  onChange: (nextRawDigits: string) => void
  placeholder?: string
  variant?: 'sm' | 'md'
  focusRingClassName?: string
  disabled?: boolean
}

export type FormattedAmountInputHandle = {
  /** ドラフトを確定し半角数字のみ親へ渡す。戻り値は正規化後の文字列 */
  commit: () => string
}

/** 全角数字（U+FF10–FF19）を半角 0–9 に寄せる（その他はそのまま） */
function fullWidthDigitsToAscii(s: string): string {
  return s.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30)
  )
}

function formatWithCommas(rawDigits: string) {
  if (!rawDigits) return ''
  const n = Number(rawDigits)
  if (!Number.isFinite(n)) return rawDigits
  return new Intl.NumberFormat('ja-JP').format(n)
}

function sanitizeDigitsAndNormalize(raw: string) {
  const asciiDigitsFirst = fullWidthDigitsToAscii(raw)
  const digitsOnly = asciiDigitsFirst.replace(/[^\d]/g, '')
  const normalized = digitsOnly.replace(/^0+(?=\d)/, '')
  return { normalized }
}

const FormattedAmountInput = forwardRef<FormattedAmountInputHandle, Props>(
  function FormattedAmountInput(
    {
      value,
      onChange,
      placeholder = '0',
      variant = 'sm',
      focusRingClassName = 'focus:ring-blue-500',
      disabled = false,
    },
    ref
  ) {
    const [draft, setDraft] = useState(() =>
      value === '' ? '' : formatWithCommas(value)
    )
    const draftRef = useRef(draft)
    draftRef.current = draft

    /**
     * 親の value は未コミットの入力中ずっと古いままなので、effect で毎回 setDraft すると draft が潰れる。
     * value プロップが「実際に変わった」ときだけ同期する（Strict Mode でも安全）。
     */
    const prevValuePropRef = useRef<string | undefined>(undefined)

    useEffect(() => {
      if (prevValuePropRef.current === undefined) {
        prevValuePropRef.current = value
        setDraft(value === '' ? '' : formatWithCommas(value))
        return
      }
      if (value !== prevValuePropRef.current) {
        prevValuePropRef.current = value
        setDraft(value === '' ? '' : formatWithCommas(value))
      }
    }, [value])

    const commit = useCallback((): string => {
      const { normalized } = sanitizeDigitsAndNormalize(draftRef.current)
      onChange(normalized)
      setDraft(normalized === '' ? '' : formatWithCommas(normalized))
      return normalized
    }, [onChange])

    useImperativeHandle(ref, () => ({ commit }), [commit])

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value.replace(/[^\d０-９]/g, '')
      setDraft(next)
    }, [])

    /** 全角数字 IME で Enter 確定した直後に半角化・カンマまで一発で反映（2 回 Enter 不要に） */
    const handleCompositionEnd = useCallback(
      (e: React.CompositionEvent<HTMLInputElement>) => {
        const next = e.currentTarget.value.replace(/[^\d０-９]/g, '')
        if (next.length === 0) return
        draftRef.current = next
        setDraft(next)
        queueMicrotask(() => {
          commit()
        })
      },
      [commit]
    )

    const handleBlur = useCallback(() => {
      commit()
    }, [commit])

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter') return
        // IME 変換中の Enter は compositionEnd 側で commit する
        if (e.nativeEvent.isComposing) return
        if ((e.nativeEvent as KeyboardEvent & { keyCode?: number }).keyCode === 229) return
        e.preventDefault()
        commit()
      },
      [commit]
    )

    const { inputClassName, suffixClassName } = useMemo(() => {
      if (variant === 'md') {
        return {
          inputClassName: `w-full px-3 py-2 pr-10 border rounded focus:outline-none focus:ring-2 ${focusRingClassName} text-sm`,
          suffixClassName: 'absolute right-3 top-2 text-gray-500 text-sm',
        }
      }
      return {
        inputClassName: `w-full px-2 py-1.5 pr-8 border rounded focus:outline-none focus:ring-2 ${focusRingClassName} text-sm`,
        suffixClassName: 'absolute right-2 top-1.5 text-gray-500 text-sm',
      }
    }, [variant, focusRingClassName])

    return (
      <div className="relative">
        <input
          type="text"
          value={draft}
          onChange={handleChange}
          onCompositionEnd={handleCompositionEnd}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onWheel={(e) => e.currentTarget.blur()}
          disabled={disabled}
          placeholder={placeholder}
          className={inputClassName}
        />
        <span className={suffixClassName}>円</span>
      </div>
    )
  }
)

FormattedAmountInput.displayName = 'FormattedAmountInput'

export default FormattedAmountInput
