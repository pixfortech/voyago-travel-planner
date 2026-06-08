/**
 * Google Maps JavaScript loader — Phase 7E (client-only).
 *
 * Loads the Maps JS SDK on demand, exactly once, and only when the PUBLIC
 * browser key (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) is configured. This key is the
 * ONLY Google key the browser ever sees; the server-only GOOGLE_MAPS_API_KEY is
 * never referenced here and never reaches the client.
 *
 * Design:
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

const SCRIPT_ID = 'voyago-google-maps-js'

let loaderPromise: Promise<GoogleMapsApi | null> | null = null

/** The public browser key (inlined at build time). May be empty. */
export function getBrowserMapsKey(): string {
  return (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '').trim()
}

/** Whether a browser key is configured for in-page Maps JS rendering. */
export function isBrowserMapsConfigured(): boolean {
  return getBrowserMapsKey().length > 0
}

/**
 * Resolve the google.maps API, loading the SDK if needed. Resolves to `null`
 * when running on the server or when no browser key is set. Rejects only on an
 * actual script load failure.
 */
export function loadGoogleMaps(): Promise<GoogleMapsApi | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)

  const key = getBrowserMapsKey()
  if (!key) return Promise.resolve(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  if (w.google?.maps) return Promise.resolve(w.google.maps as GoogleMapsApi)

  if (loaderPromise) return loaderPromise

  loaderPromise = new Promise<GoogleMapsApi | null>((resolve, reject) => {
    const finish = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const maps = (window as any).google?.maps
      if (maps) resolve(maps as GoogleMapsApi)
      else {
        loaderPromise = null
        reject(new Error('maps_js_unavailable'))
      }
    }

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', finish)
      existing.addEventListener('error', () => {
        loaderPromise = null
        reject(new Error('maps_js_load_failed'))
      })
      return
    }

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async`
    script.async = true
    script.defer = true
    script.onload = finish
    script.onerror = () => {
      loaderPromise = null
      reject(new Error('maps_js_load_failed'))
    }
    document.head.appendChild(script)
  })

  return loaderPromise
}
