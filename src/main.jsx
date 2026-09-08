import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// The service worker only caches this app's own build output, so the app opens
// on a phone with no signal. It is generated at build time and never present in
// dev, where a stale cache would just get in the way.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // A blocked or unsupported registration is not worth bothering anyone about.
    })
  })
}
