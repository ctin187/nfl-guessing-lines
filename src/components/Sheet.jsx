import { useEffect, useRef } from 'react'

/** Bottom sheet: scrim click, Escape and a close button all dismiss it. */
export default function Sheet({ title, onClose, children, action = null }) {
  const panel = useRef(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.querySelector('button, input, textarea, [tabindex]')?.focus?.()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div
      className="scrim"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="sheet" ref={panel}>
        <div className="sheet__head">
          <h2>{title}</h2>
          {action}
          <button type="button" className="iconbtn" onClick={onClose}>Done</button>
        </div>
        <div className="sheet__body">{children}</div>
      </div>
    </div>
  )
}
