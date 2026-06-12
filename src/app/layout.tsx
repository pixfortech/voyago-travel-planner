import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AppProvider } from '@/context/AppContext'
import { LayoutProvider } from '@/context/LayoutContext'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'VoyaGO — Travel Planner',
  description: 'Plan your perfect trip with day-wise itineraries, budget tracking, and more.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <LayoutProvider>
          <AppProvider>{children}</AppProvider>
        </LayoutProvider>
      </body>
    </html>
  )
}
