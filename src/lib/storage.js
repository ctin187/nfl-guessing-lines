// Thin, defensive wrapper over localStorage. Private-mode Safari and "block site
// data" settings make every accessor throw, so nothing here is allowed to escape.

const PREFIX = 'ngl.v1.'

export const KEYS = {
  guesses: `${PREFIX}guesses`,
  snapshots: `${PREFIX}snapshots`,
  reveals: `${PREFIX}reveals`,
  settings: `${PREFIX}settings`,
  schedule: `${PREFIX}schedule`,
  ui: `${PREFIX}ui`,
}

let memory = new Map()
let available = null

function probe() {
  if (available !== null) return available
  try {
    const k = `${PREFIX}__probe`
    window.localStorage.setItem(k, '1')
    window.localStorage.removeItem(k)
    available = true
  } catch {
    available = false
  }
  return available
}

/** Read and parse a key, falling back to `fallback` on anything unexpected. */
export function load(key, fallback) {
  try {
    const raw = probe() ? window.localStorage.getItem(key) : memory.get(key)
    if (raw == null) return fallback
    const parsed = JSON.parse(raw)
    return parsed === null || parsed === undefined ? fallback : parsed
  } catch {
    return fallback
  }
}

/** Serialise and persist. Returns false when storage rejected the write. */
export function save(key, value) {
  const raw = JSON.stringify(value)
  try {
    if (probe()) window.localStorage.setItem(key, raw)
    else memory.set(key, raw)
    return true
  } catch {
    // Quota exceeded, or storage disabled mid-session: keep the value for this
    // session so the UI stays consistent even though it will not survive a reload.
    memory.set(key, raw)
    available = false
    return false
  }
}

export function remove(key) {
  try {
    if (probe()) window.localStorage.removeItem(key)
  } catch { /* ignore */ }
  memory.delete(key)
}

export const storageAvailable = () => probe()

/** Everything this app owns, for the export/import controls in settings. */
export function exportAll() {
  return {
    app: 'nfl-guessing-lines',
    version: 1,
    exportedAt: new Date().toISOString(),
    guesses: load(KEYS.guesses, {}),
    snapshots: load(KEYS.snapshots, {}),
    reveals: load(KEYS.reveals, {}),
  }
}

/** Merge a previously exported blob back in. Never clobbers with empty objects. */
export function importAll(blob) {
  if (!blob || typeof blob !== 'object') throw new Error('Not a backup file')
  const counts = { guesses: 0, snapshots: 0, reveals: 0 }
  for (const key of ['guesses', 'snapshots', 'reveals']) {
    const incoming = blob[key]
    if (!incoming || typeof incoming !== 'object') continue
    const merged = { ...load(KEYS[key], {}), ...incoming }
    save(KEYS[key], merged)
    counts[key] = Object.keys(incoming).length
  }
  if (!counts.guesses && !counts.snapshots && !counts.reveals) {
    throw new Error('Backup contained no guesses, snapshots or reveals')
  }
  return counts
}
