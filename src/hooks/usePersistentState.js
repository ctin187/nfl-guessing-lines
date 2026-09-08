import { useCallback, useEffect, useRef, useState } from 'react'
import { load, save } from '../lib/storage.js'

/**
 * useState backed by localStorage. Writes are debounced so holding down the
 * half-point stepper does not hammer storage on every tick.
 */
export function usePersistentState(key, initial, { debounceMs = 250 } = {}) {
  const [value, setValue] = useState(() => load(key, initial))
  const timer = useRef(null)
  const latest = useRef(value)
  latest.current = value

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => save(key, latest.current), debounceMs)
    return () => clearTimeout(timer.current)
  }, [key, value, debounceMs])

  // Do not lose the last few edits if the tab is closed inside the debounce window.
  useEffect(() => {
    const flush = () => save(key, latest.current)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', flush)
      flush()
    }
  }, [key])

  const reset = useCallback(() => setValue(initial), [initial])
  return [value, setValue, reset]
}
