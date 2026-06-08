/**
 * Google Maps JavaScript loader — Phase 7E (client-only).
 *
 * Loads the Maps JS SDK on demand, exactly once, and only when the PUBLIC
 * browser key (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) is configured. This key is the
 * ONLY Google key the browser ever sees; the server-only GOOGLE_MAPS_API_KEY is
 * never referenced here and never reaches the client.
 *
 * Design:
 *   • Uses the `callback` query parameter — the ONLY reliable way to know when
 *     window.google.maps is fully initialised. DO NOT use `loading=async`: that
 *     param tells the SDK to skip populating window.google.maps on script load,
 *     so the traditional onload check always finds an empty stub and rejects.
 *   • A module-level singleton promise prevents duplicate <script> injections,
 *     even across many component mounts / remounts.
 *   • Returns `null` (rather than throwing) when there is no key or no window,
 *     so callers can cleanly fall back to the SVG route.
 *   • On a real load error the promise rejects AND the singleton is cleared, so
 *     a later attempt can retry.
 */

/** The google.maps namespace. Typed loosely to avoid adding @types/google.maps. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GoogleMapsApi = any

export type LoaderState = 'idle' | 'pending' | 'resolved' | 'rejected'

const SCRIPT_ID = 'voyago-google-maps-js'
const CALLBACK_NAME = '__voyagoMapsInit'

let loaderPromise: Promise<GoogleMapsApi | null> | null = null
let _loaderState: LoaderState = 'idle'

/** The public browser key (inlined at build time by Next.js). May be empty. */
export function getBrowserMapsKey(): string {
  return (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '').trim()
}

/** Whether a browser key is configured for in-page Maps JS rendering. */
export function isBrowserMapsConfigured(): boolean {
  return getBrowserMapsKey().length > 0
}

/** Current state of the module-level loader (for debug panels). */
export function getLoaderState(): LoaderState {
  return _loaderState
}

/**
 * Resolve the google.maps API, loading the SDK if needed. Resolves to `null`
 * when running on the server or when no browser key is set. Rejects only on an
 * actual script load failure.
 *
 * Implementation note: we use the `callback` URL parameter so the Maps JS SDK
 * calls our global function when window.google.maps is fully initialised.
 * Using script.onload instead is unreliable because google.maps may not be
 * populated yet when the onload event fires (depending on Maps JS version and
 * how the response is structured).
 */
export function loadGoogleMaps(): Promise<GoogleMapsApi | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)

  const key = getBrowserMapsKey()
  if (!key) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Voyago Maps] browser key absent — Maps canvas disabled.')
    }
    return Promise.resolve(null)
  }

  // If already loaded and attached to window, return immediately.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = (window as any).google?.maps
  if (existing?.Map) {
    _loaderState = 'resolved'
    return Promise.resolve(existing as GoogleMapsApi)
  }

  if (loaderPromise) return loaderPromise

  if (process.env.NODE_ENV === 'development') {
    console.log('[Voyago Maps] browser key present — loading Maps JS SDK…')
  }

  _loaderState = 'pending'

  loaderPromise = new Promise<GoogleMapsApi | null>((resolve, reject) => {
    // Define the callback BEFORE injecting the script so Maps JS can call it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any)[CALLBACK_NAME] = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const maps = (window as any).google?.maps
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any)[CALLBACK_NAME]
      if (maps?.Map) {
        _loaderState = 'resolved'
        if (process.env.NODE_ENV === 'development') {
          console.log('[Voyago Maps] SDK loaded — google.maps.Map is available.')
        }
        resolve(maps as GoogleMapsApi)
      } else {
        _loaderState = 'rejected'
        loaderPromise = null
        if (process.env.NODE_ENV === 'development') {
          console.warn('[Voyago Maps] Callback fired but google.maps.Map missing.')
        }
        reject(new Error('maps_js_unavailable'))
      }
    }

    // If a script tag was already injected (e.g. by a previous hot-reload),
    // the callback may already have been called — check synchronously.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (document.getElementById(SCRIPT_ID) && (window as any).google?.maps?.Map) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any)[CALLBACK_NAME]()
      return
    }

    // Guard against injecting a second script tag.
    if (document.getElementById(SCRIPT_ID)) {
      // Script injected but not yet loaded; callback will fire when ready.
      return
    }

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    // Using callback= is the canonical pattern. Do NOT use loading=async:
    // that param defers populating window.google.maps until importLibrary()
    // is called, breaking the traditional window.google.maps check.
    script.src = [
      'https://maps.googleapis.com/maps/api/js',
      `?key=${encodeURIComponent(key)}`,
      '&v=weekly',
      `&callback=${CALLBACK_NAME}`,
    ].join('')
    script.async = true
    script.defer = true
    script.onerror = () => {
      _loaderState = 'rejected'
      loaderPromise = null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any)[CALLBACK_NAME]
      if (process.env.NODE_ENV === 'development') {
        console.error('[Voyago Maps] Maps JS script failed to load (network/key error).')
      }
      reject(new Error('maps_js_load_failed'))
    }
    document.head.appendChild(script)
  })

  return loaderPromise
}
