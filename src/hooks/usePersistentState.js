import { useCallback, useEffect, useRef, useState } from 'react'
import { load, save } from '../lib/storage.js'

/**
 * useState backed by localStorage.
 *
 * Two things this has to get right beyond the obvious:
 *
 * - Writes are debounced, so holding the half-point stepper does not hammer
 *   storage, but a backgrounded or closing tab still flushes what it holds.
 * - A tab only ever writes a value it actually changed. Flushing unconditionally
 *   means a second tab sitting idle on the same season can overwrite the tab you
 *   were just typing in. Incoming writes from other tabs are adopted instead.
 */
export function usePersistentState(key, initial, { debounceMs = 250 } = {}) {
  const [value, setValue] = useState(() => load(key, initial))
  const timer = useRef(null)
  const latest = useRef(value)
  const dirty = useRef(false)
  const selfWrite = useRef(null)

  const flush = useCallback(() => {
    if (!dirty.current) return
    selfWrite.current = JSON.stringify(latest.current)
    save(key, latest.current)
    dirty.current = false
  }, [key])

  const set = useCallback((next) => {
    dirty.current = true
    setValue(next)
  }, [])

  useEffect(() => {
    latest.current = value
    if (!dirty.current) return undefined
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, debounceMs)
    return () => clearTimeout(timer.current)
  }, [value, flush, debounceMs])

  useEffect(() => {
    // Backgrounding on mobile is the common way a tab dies, so flush there too.
    const onHide = () => flush()
    // Another tab wrote this key: adopt it rather than racing it.
    const onStorage = (event) => {
      if (event.key !== key || event.newValue === null) return
      if (event.newValue === selfWrite.current) return
      try {
        setValue(JSON.parse(event.newValue))
        dirty.current = false
      } catch { /* leave local state alone if the write was malformed */ }
    }
    window.addEventListener('pagehide', onHide)
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [key, flush])

  return [value, set]
}
