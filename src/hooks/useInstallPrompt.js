import { useCallback, useEffect, useState } from 'react'

/**
 * Chromium fires `beforeinstallprompt` and expects the page to hold onto the event
 * until the user asks to install. Browsers that never fire it (Safari, Firefox, or
 * an already-installed app) leave `available` false and the button stays hidden.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null)

  useEffect(() => {
    const onPrompt = (event) => {
      event.preventDefault()
      setDeferred(event)
    }
    const onInstalled = () => setDeferred(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (!deferred) return null
    deferred.prompt()
    const { outcome } = await deferred.userChoice
    setDeferred(null)
    return outcome
  }, [deferred])

  return { available: Boolean(deferred), install }
}
