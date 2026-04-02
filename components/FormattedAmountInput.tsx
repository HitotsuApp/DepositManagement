'use client'

import { useCallback, useMemo, useRef } from 'react'

type Props = {
  value: string // カンマなしの数値文字列（DB/送信用）
  onChange: (nextRawDigits: string) => void
  placeholder?: string
  variant?: 'sm' | 'md'
  focusRingClassName?: string
  disabled?: boolean
}

function countDigitsBefore(value: string, pos: number) {
  const end = Math.max(0, Math.min(pos, value.length))
  let count = 0
  for (let i = 0; i < end; i++) {
    const ch = value[i]
    if (ch >= '0' && ch <= '9') count++
  }
  return count
}

function mapRawDigitIndexToFormattedCaret(formatted: string, rawDigitIndex: number) {
  // rawDigitIndex は「数字何文字目の後ろ（=カーソル位置）」を表す
  if (rawDigitIndex <= 0) return 0
  let digitCount = 0
  for (let i = 0; i < formatted.length; i++) {
    const ch = formatted[i]
    if (ch >= '0' && ch <= '9') {
      digitCount++
      if (digitCount === rawDigitIndex) return i + 1
    }
  }
  // rawDigitIndex が末尾を超える場合は末尾へ
  return formatted.length
}

function formatWithCommas(rawDigits: string) {
  if (!rawDigits) return ''
  const n = Number(rawDigits)
  if (!Number.isFinite(n)) return rawDigits
  return new Intl.NumberFormat('ja-JP').format(n)
}

function sanitizeDigitsAndNormalize(raw: string) {
  // 数字以外を除去（例: カンマなど）
  const digitsOnly = raw.replace(/[^\d]/g, '')
  // 先頭0を落とす（ただし「0」だけは残る）
  // ※ caret 計算のため、onChange側で落ちた先頭0を考慮する
  const normalized = digitsOnly.replace(/^0+(?=\d)/, '')
  const removedLeadingZeros = digitsOnly.length - normalized.length
  return { normalized, removedLeadingZeros }
}

export default function FormattedAmountInput({
  value,
  onChange,
  placeholder = '0',
  variant = 'sm',
  focusRingClassName = 'focus:ring-blue-500',
  disabled = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  const formattedValue = useMemo(() => formatWithCommas(value), [value])

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

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const currentDisplay = e.target.value
      const selectionStart = e.target.selectionStart ?? currentDisplay.length

      const digitsBeforeCaretInDisplay = countDigitsBefore(currentDisplay, selectionStart)

      const { normalized, removedLeadingZeros } = sanitizeDigitsAndNormalize(currentDisplay)

      // 先頭0を落とした分、カーソル位置（数字何文字目）も補正
      let normalizedCaretDigitIndex = digitsBeforeCaretInDisplay
      if (removedLeadingZeros > 0) {
        // 先頭0より前にカーソルがあるならその位置は残る
        // 先頭0内にカーソルがあるなら 0 へ寄せる
        if (digitsBeforeCaretInDisplay <= removedLeadingZeros) {
          normalizedCaretDigitIndex = 0
        } else {
          normalizedCaretDigitIndex = digitsBeforeCaretInDisplay - removedLeadingZeros
        }
      }

      onChange(normalized)

      // state反映後にカーソル位置を整える（表示整形のため）
      requestAnimationFrame(() => {
        const el = inputRef.current
        if (!el) return

        const nextFormatted = formatWithCommas(normalized)
        const caretInFormatted = mapRawDigitIndexToFormattedCaret(
          nextFormatted,
          normalizedCaretDigitIndex
        )
        el.setSelectionRange(caretInFormatted, caretInFormatted)
      })
    },
    [onChange]
  )

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={formattedValue}
        onChange={handleChange}
        onWheel={(e) => e.currentTarget.blur()}
        disabled={disabled}
        placeholder={placeholder}
        className={inputClassName}
      />
      <span className={suffixClassName}>円</span>
    </div>
  )
}

