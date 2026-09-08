import { useState } from 'react'
import { describeSpread, formatSpread, isPartialSpread, parseSpread, stepSpread } from '../lib/lines.js'

/**
 * One line entry: half-point steppers either side of a free-text field.
 *
 * The field holds a raw draft string only while it has focus, so a half-typed
 * "-3." is never reformatted out from under you. Unfocused, it renders the
 * committed value directly - there is no second copy of state to keep in sync.
 */
export default function SpreadInput({ value, onChange, home, away, disabled, inputId }) {
  const [draft, setDraft] = useState(null)
  const editing = draft !== null
  const committed = value === null || value === undefined ? '' : formatSpread(value)
  const shown = editing ? draft : committed

  const parsed = parseSpread(shown)
  const invalid = editing && draft.trim() !== '' && parsed === null && !isPartialSpread(draft)

  const step = (dir) => {
    const next = stepSpread(value ?? parsed ?? 0, dir)
    if (editing) setDraft(formatSpread(next))
    onChange(next)
  }

  const handleType = (raw) => {
    setDraft(raw)
    const n = parseSpread(raw)
    if (n !== null) onChange(n)
    else if (raw.trim() === '') onChange(null)
  }

  const effective = parsed !== null ? parsed : (value ?? null)
  const hint = invalid
    ? 'Enter a number like -3.5, +7 or PK'
    : effective === null
      ? `Spread for ${home}, the home team`
      : describeSpread(effective, { home, away })

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
            value={shown}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={`${inputId}-hint`}
            onFocus={(e) => { setDraft(committed); e.target.select() }}
            onBlur={() => {
              onChange(parseSpread(draft))
              setDraft(null)
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
