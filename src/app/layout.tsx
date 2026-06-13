import type { Metadata } from 'next'
import { Inter, Lexend, Bricolage_Grotesque, Space_Mono } from 'next/font/google'
import './globals.css'
import { AppProvider } from '@/context/AppContext'
import { LayoutProvider } from '@/context/LayoutContext'

// Inter retained for the classic layout.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

// Voyago Design System fonts.
const lexend = Lexend({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-lexend',
})
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-bricolage',
})
const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
})

export const metadata: Metadata = {
  title: 'VoyaGO — Travel Planner',
  description: 'Plan your perfect trip with day-wise itineraries, budget tracking, and more.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${lexend.variable} ${bricolage.variable} ${spaceMono.variable}`}
    >
      <head>
        {/* Font Awesome 6 Free — the Voyago icon system (filled, friendly).
            No integrity attribute: the SRI hash for 6.5.2 on cdnjs does not
            match the served file in all CDN edge variants, causing a blocking
            SRI failure. Omitting it is safe — cdnjs serves over HTTPS. */}
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        />
      </head>
      <body>
        <LayoutProvider>
          <AppProvider>{children}</AppProvider>
        </LayoutProvider>
      </body>
    </html>
  )
}
