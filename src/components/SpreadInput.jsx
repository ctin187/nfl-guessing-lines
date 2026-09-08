import { useEffect, useState } from 'react'
import { describeSpread, formatSpread, isPartialSpread, parseSpread, stepSpread } from '../lib/lines.js'

/**
 * One line entry: half-point steppers either side of a free-text field.
 * Typing wins while the field has focus; the steppers write straight through.
 */
export default function SpreadInput({ value, onChange, home, away, disabled, inputId }) {
  const [draft, setDraft] = useState(() => (value === null || value === undefined ? '' : formatSpread(value)))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (focused) return
    setDraft(value === null || value === undefined ? '' : formatSpread(value))
  }, [value, focused])

  const parsed = parseSpread(draft)
  const invalid = draft.trim() !== '' && parsed === null && !isPartialSpread(draft)

  const step = (dir) => {
    const next = stepSpread(value ?? parsed ?? 0, dir)
    setDraft(formatSpread(next))
    onChange(next)
  }

  const handleType = (raw) => {
    setDraft(raw)
    const n = parseSpread(raw)
    if (n !== null) onChange(n)
    else if (raw.trim() === '') onChange(null)
  }

  const shown = parsed !== null ? parsed : value ?? null
  const hint = invalid
    ? 'Enter a number like -3.5, +7 or PK'
    : shown === null
      ? `Spread for ${home}, the home team`
      : describeSpread(shown, { home, away })

  return (
    <div>
      <div className="stepper">
        <button
          type="button"
          className="stepper__btn"
          onClick={() => step(-1)}
          disabled={disabled}
          aria-label={`Move the line half a point toward ${home}`}
        >
          −
        </button>
        <div className="stepper__field">
          <input
            id={inputId}
            className={`stepper__input${invalid ? ' is-invalid' : ''}`}
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="—"
            value={draft}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={`${inputId}-hint`}
            onFocus={(e) => { setFocused(true); e.target.select() }}
            onBlur={() => {
              setFocused(false)
              const n = parseSpread(draft)
              setDraft(n === null ? '' : formatSpread(n))
              onChange(n)
            }}
            onChange={(e) => handleType(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'ArrowUp') { e.preventDefault(); step(1) }
              if (e.key === 'ArrowDown') { e.preventDefault(); step(-1) }
            }}
          />
        </div>
        <button
          type="button"
          className="stepper__btn"
          onClick={() => step(1)}
          disabled={disabled}
          aria-label={`Move the line half a point toward ${away}`}
        >
          +
        </button>
      </div>
      <p id={`${inputId}-hint`} className={`stepper__hint${invalid ? ' is-invalid' : ''}`}>{hint}</p>
    </div>
  )
}
