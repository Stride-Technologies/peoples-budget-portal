'use client'

import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { groupDigits, padDecimalString } from '@/lib/currency-formatter'
import { cn } from '@/lib/utils'

/**
 * The one money input. Groups thousands live as the user types and pads to two
 * decimals on blur.
 *
 * Deals in **decimal strings**, never numbers: money is `Decimal(18, 2)` on the
 * wire and both AGENTS.md files forbid coercing it to `Number`. Callers whose
 * form field is still number-typed convert at their own boundary, so the
 * coercion stays visible at the call site instead of hiding in here.
 */
interface CurrencyInputProps
  extends Omit<ComponentProps<typeof Input>, 'type' | 'value' | 'onChange'> {
  /** Decimal string, e.g. `"2500000.00"`. Empty string means "not entered". */
  value?: string
  onChange: (value: string) => void
}

/** Group the integer part, leaving any decimal tail (and a lone trailing `.`) alone. */
function formatWithCommas(raw: string): string {
  const dotIdx = raw.indexOf('.')
  if (dotIdx === -1) return groupDigits(raw)
  return groupDigits(raw.slice(0, dotIdx)) + raw.slice(dotIdx)
}

export function CurrencyInput({ value, onChange, className, onBlur, ...props }: CurrencyInputProps) {
  const isFocused = useRef(false)
  const [display, setDisplay] = useState(() => formatWithCommas(value ?? ''))

  // Sync from parent when not focused (form reset, external value changes).
  // Guarded so re-formatting never fights the caret mid-keystroke.
  useEffect(() => {
    if (!isFocused.current) {
      setDisplay(formatWithCommas(value ?? ''))
    }
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target
    const cursorPos = el.selectionStart ?? 0
    const raw = el.value

    // Count significant chars (digits + '.') before the cursor in old value
    const sigBefore = raw.slice(0, cursorPos).replace(/,/g, '').length

    // Strip to digits + at most one decimal point
    const stripped = raw.replace(/[^\d.]/g, '')
    const firstDot = stripped.indexOf('.')
    const clean =
      firstDot === -1
        ? stripped
        : stripped.slice(0, firstDot + 1) + stripped.slice(firstDot + 1).replace(/\./g, '').slice(0, 2)

    const formatted = formatWithCommas(clean)
    setDisplay(formatted)

    // Restore cursor: find position after the sigBefore-th significant char in the new string
    let newCursor = formatted.length
    if (sigBefore > 0) {
      let sigCount = 0
      for (let i = 0; i < formatted.length; i++) {
        if (formatted[i] !== ',') {
          sigCount++
          if (sigCount === sigBefore) {
            newCursor = i + 1
            break
          }
        }
      }
    } else {
      newCursor = 0
    }

    requestAnimationFrame(() => {
      el.setSelectionRange(newCursor, newCursor)
    })

    onChange(clean)
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocused.current = false
    // Settle to two decimals, but only if something was entered — padding an
    // empty optional amount to "0.00" would turn "not entered" into a real zero.
    const padded = padDecimalString(value ?? '')
    setDisplay(formatWithCommas(padded))
    if (padded !== (value ?? '')) onChange(padded)
    onBlur?.(e)
  }

  const handleFocus = () => {
    isFocused.current = true
  }

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      className={cn(className)}
    />
  )
}
