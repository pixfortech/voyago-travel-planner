'use client'

import { AlertTriangle, ExternalLink } from 'lucide-react'
import type { AuthSetupError } from '@/context/AppContext'

export default function FirebaseSetupBanner({ error }: { error: AuthSetupError }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mb-5">
        <AlertTriangle size={28} className="text-amber-500" />
      </div>

      {error === 'anonymous-not-enabled' ? (
        <>
          <h2 className="text-xl font-black text-gray-900 mb-2">
            Anonymous sign-in is not enabled
          </h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-6 max-w-sm">
            Voyago uses anonymous sign-in for instant, account-free sessions. Enable it in your
            Firebase Console, then refresh this page.
          </p>
          <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 text-left text-sm space-y-2 max-w-sm w-full mb-6">
            <p className="font-bold text-gray-800 mb-3">Fix in 3 steps:</p>
            <p className="text-gray-600">
              1. Open <strong>Firebase Console</strong> → your project
            </p>
            <p className="text-gray-600">
              2. Go to <strong>Authentication → Sign-in method</strong>
            </p>
            <p className="text-gray-600">
              3. Enable <strong>Anonymous</strong> and click Save
            </p>
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
              <p className="text-xs text-gray-400">
                Also confirm that <code className="bg-gray-100 px-1 rounded">localhost</code> is
                listed under Authentication → Settings → Authorised domains.
              </p>
            </div>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-xl font-black text-gray-900 mb-2">Firebase authentication error</h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-6 max-w-sm">
            Check your <code className="bg-gray-100 px-1 rounded">.env.local</code> values and
            Firebase Console configuration. See the README for setup instructions.
          </p>
        </>
      )}

      <a
        href="https://console.firebase.google.com"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 bg-gradient-to-r from-primary-500 to-teal-500 text-white font-bold px-6 py-3 rounded-xl text-sm shadow-md hover:shadow-lg transition-shadow"
      >
        Open Firebase Console
        <ExternalLink size={14} />
      </a>
      <button
        onClick={() => window.location.reload()}
        className="mt-3 text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        Refresh page →
      </button>
    </div>
  )
}
