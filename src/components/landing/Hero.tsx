'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { MapPin, CalendarDays, Wallet, Share2 } from 'lucide-react'

const features = [
  { icon: <CalendarDays size={20} />, title: 'Day-wise Itinerary', desc: 'Plan every activity, hotel and meal per day.' },
  { icon: <Wallet size={20} />, title: 'Budget Tracker', desc: 'Track spending by category and stay on budget.' },
  { icon: <MapPin size={20} />, title: 'Destination Notes', desc: 'Save addresses, bookings and travel tips.' },
  { icon: <Share2 size={20} />, title: 'Share Trips', desc: 'Export or share your trip plan with anyone.' },
]

export default function Hero() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-500 to-teal-400 flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-lg mx-auto w-full">
        <div className="flex items-baseline gap-0.5">
          <span className="text-2xl font-black text-white tracking-tight">Voya</span>
          <span className="text-2xl font-black text-primary-100 tracking-tight">GO</span>
        </div>
        <Link
          href="/dashboard"
          className="text-sm font-semibold text-white/80 hover:text-white transition-colors"
        >
          My Trips →
        </Link>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-16 max-w-lg mx-auto w-full text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm text-white text-sm font-semibold px-4 py-2 rounded-full mb-6">
            <MapPin size={14} />
            Travel smarter, explore more
          </div>

          <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight mb-4">
            Plan your perfect
            <br />
            <span className="text-primary-100">trip in minutes</span>
          </h1>

          <p className="text-white/80 text-base leading-relaxed mb-8 max-w-sm mx-auto">
            Build day-by-day itineraries, track your budget, and keep all your travel details in
            one beautiful place.
          </p>

          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 bg-white text-primary-600 font-bold px-8 py-4 rounded-2xl text-base shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 active:translate-y-0"
          >
            Start Planning Free →
          </Link>
        </motion.div>
      </div>

      {/* Features */}
      <div className="bg-white rounded-t-3xl px-6 pt-8 pb-10 max-w-lg mx-auto w-full">
        <h2 className="text-lg font-black text-gray-900 text-center mb-6">
          Everything you need for your trip
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i + 0.3 }}
              className="bg-gray-50 rounded-2xl p-4"
            >
              <div className="w-9 h-9 bg-primary-100 rounded-xl flex items-center justify-center text-primary-600 mb-2.5">
                {f.icon}
              </div>
              <p className="text-sm font-bold text-gray-900">{f.title}</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-snug">{f.desc}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 bg-primary-500 text-white font-bold px-6 py-3 rounded-xl text-sm hover:bg-primary-600 transition-colors"
          >
            Get Started — it&apos;s free
          </Link>
        </div>
      </div>
    </div>
  )
}
