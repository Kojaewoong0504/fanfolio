import { useEffect } from 'react'

const DOOP_SYNC_SRC = 'https://doop.design/doop-sync.js'

/**
 * Sends explicitly enabled screens to the Doop canvas configured by the key.
 * Production loading is opt-in so the sync script can never appear in a
 * normal deployment by accident.
 */
export function DoopSync() {
  useEffect(() => {
    const syncEnabled = import.meta.env.DEV || import.meta.env.VITE_DOOP_SYNC_ENABLED === 'true'
    if (!syncEnabled) return

    const key = import.meta.env.VITE_DOOP_SYNC_KEY
    if (!key || document.querySelector(`script[data-doop-sync="${key}"]`)) return

    const preview = new URLSearchParams(window.location.search).get('preview')
    const originalTitle = document.title
    const originalHtmlWidth = document.documentElement.style.width
    const originalBodyWidth = document.body.style.width
    const originalBodyMargin = document.body.style.margin
    const originalBodyOverflowX = document.body.style.overflowX
    if (preview) document.title = `Fanfolio · ${preview}`
    if (preview) {
      document.documentElement.style.width = '430px'
      document.body.style.width = '430px'
      document.body.style.margin = '0 auto'
      document.body.style.overflowX = 'hidden'
    }

    const script = document.createElement('script')
    script.async = true
    script.src = `${DOOP_SYNC_SRC}?key=${encodeURIComponent(key)}`
    script.dataset.doopSync = key
    const startSync = window.setTimeout(() => {
      if (preview) document.title = `Fanfolio · ${preview}`
      document.querySelectorAll('input[type="email"], input[type="password"], [data-doop-sensitive]')
        .forEach(element => element.setAttribute('data-doop-mask', 'true'))
      document.head.appendChild(script)
    }, 100)

    return () => {
      window.clearTimeout(startSync)
      script.remove()
      document.title = originalTitle
      document.documentElement.style.width = originalHtmlWidth
      document.body.style.width = originalBodyWidth
      document.body.style.margin = originalBodyMargin
      document.body.style.overflowX = originalBodyOverflowX
    }
  }, [])

  return null
}
