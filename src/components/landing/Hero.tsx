'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  MapPin, CalendarDays, Wallet, Share2, Sparkles,
  Camera, Users, Map, Zap, ChevronRight, Lock,
} from 'lucide-react'

const features = [
  {
    icon: <CalendarDays size={22} />,
    title: 'Day-wise Itinerary',
    desc: 'Plan every activity, meal and hotel per day.',
    iconBg: 'bg-gradient-to-br from-primary-500 to-teal-500',
    cardBg: 'bg-gradient-to-br from-primary-50 to-teal-50',
    shadow: 'shadow-primary-500/20',
  },
  {
    icon: <Wallet size={22} />,
    title: 'Budget Tracker',
    desc: 'Track spending by category and stay on budget.',
    iconBg: 'bg-gradient-to-br from-amber-400 to-orange-500',
    cardBg: 'bg-gradient-to-br from-amber-50 to-orange-50',
    shadow: 'shadow-amber-500/20',
  },
  {
    icon: <Share2 size={22} />,
    title: 'Share & Export',
    desc: 'Export or share your full trip plan with anyone.',
    iconBg: 'bg-gradient-to-br from-violet-500 to-purple-500',
    cardBg: 'bg-gradient-to-br from-violet-50 to-purple-50',
    shadow: 'shadow-violet-500/20',
  },
  {
    icon: <MapPin size={22} />,
    title: 'Trip Notes',
    desc: 'Save addresses, bookings and travel tips.',
    iconBg: 'bg-gradient-to-br from-rose-400 to-pink-500',
    cardBg: 'bg-gradient-to-br from-rose-50 to-pink-50',
    shadow: 'shadow-rose-500/20',
  },
]

const comingSoon = [
  {
    icon: <Sparkles size={19} />,
    title: 'AI Trip Generator',
    desc: 'Let AI build your perfect itinerary in seconds.',
  },
  {
    icon: <Camera size={19} />,
    title: 'Travel Photos',
    desc: 'Capture and organise your trip memories.',
  },
  {
    icon: <Users size={19} />,
    title: 'Collaboration',
    desc: 'Plan together with your travel companions.',
  },
  {
    icon: <Map size={19} />,
    title: 'Interactive Maps',
    desc: 'Visualise your route and explore destinations.',
  },
]

export default function Hero() {
  return (
    <div className="min-h-screen flex flex-col bg-[#08111f]">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-lg mx-auto w-full">
        <div className="flex items-baseline gap-0">
          <span className="text-xl font-black bg-gradient-to-r from-primary-400 to-teal-400 bg-clip-text text-transparent tracking-tight">
            Voya
          </span>
          <span className="text-xl font-black text-white tracking-tight">GO</span>
        </div>
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-sm font-semibold text-primary-400 hover:text-primary-300 transition-colors"
        >
          My Trips <ChevronRight size={14} />
        </Link>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-12 max-w-lg mx-auto w-full text-center relative overflow-hidden">
        {/* Ambient gradient blobs */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-teal-500/15 rounded-full blur-3xl pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          <div className="inline-flex items-center gap-2 bg-primary-500/10 border border-primary-500/25 text-primary-400 text-xs font-bold px-4 py-2 rounded-full mb-6 tracking-widest uppercase">
            <Sparkles size={11} />
            AI-Powered Travel Planning
          </div>

          <h1 className="text-4xl sm:text-5xl font-black text-white leading-[1.08] mb-5 tracking-tight">
            Plan your perfect
            <br />
            <span className="bg-gradient-to-r from-primary-400 to-teal-300 bg-clip-text text-transparent">
              trip in minutes
            </span>
          </h1>

          <p className="text-white/55 text-base leading-relaxed mb-9 max-w-sm mx-auto">
            Build day-by-day itineraries, track your budget, and keep all your travel details in one beautiful place.
          </p>

          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2.5 bg-gradient-to-r from-primary-500 to-teal-500 text-white font-bold px-8 py-4 rounded-2xl text-base shadow-xl shadow-primary-500/30 hover:shadow-2xl hover:shadow-primary-500/40 hover:-translate-y-0.5 transition-all"
          >
            <Zap size={18} />
            Start Planning Free
          </Link>

          <div className="flex items-center justify-center gap-10 mt-10 pt-10 border-t border-white/10">
            {[
              { value: '10+', label: 'Trip Types' },
              { value: '∞', label: 'Destinations' },
              { value: 'Free', label: 'Forever' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-2xl font-black text-white">{s.value}</p>
                <p className="text-xs text-white/35 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* White card — features + coming soon + CTA */}
      <div className="bg-white rounded-t-[2rem] max-w-lg mx-auto w-full">

        {/* Features section */}
        <div className="px-6 pt-10 pb-8">
          <div className="text-center mb-8">
            <p className="text-xs font-black text-primary-500 uppercase tracking-widest mb-2">
              What&apos;s Included
            </p>
            <h2 className="text-2xl font-black text-gray-900">Everything you need</h2>
            <p className="text-gray-400 text-sm mt-1.5">All core features are free, forever.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 * i + 0.15, ease: [0.22, 1, 0.36, 1] }}
                className={`${f.cardBg} rounded-2xl p-4`}
              >
                <div
                  className={`w-10 h-10 ${f.iconBg} rounded-xl flex items-center justify-center text-white mb-3 shadow-md ${f.shadow}`}
                >
                  {f.icon}
                </div>
                <p className="text-sm font-bold text-gray-900 leading-tight">{f.title}</p>
                <p className="text-xs text-gray-500 mt-1 leading-snug">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Coming Soon dark card */}
        <div className="px-6 pb-8">
          <div className="bg-gradient-to-br from-gray-900 to-[#0f1a2e] rounded-3xl p-6">
            <div className="inline-flex items-center gap-1.5 bg-primary-500/15 border border-primary-500/20 text-primary-400 text-xs font-bold px-3 py-1.5 rounded-full mb-4">
              <Lock size={10} />
              Coming Soon
            </div>
            <h3 className="text-xl font-black text-white mb-1">Next-level features</h3>
            <p className="text-white/45 text-sm mb-6">
              Powerful AI and collaboration tools, arriving soon.
            </p>

            <div className="space-y-4">
              {comingSoon.map((item, i) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * i + 0.35 }}
                  className="flex items-start gap-3"
                >
                  <div className="w-9 h-9 bg-white/8 border border-white/10 rounded-xl flex items-center justify-center text-primary-400 flex-shrink-0">
                    {item.icon}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{item.title}</p>
                    <p className="text-xs text-white/45 mt-0.5">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="px-6 pb-16 text-center border-t border-gray-100 pt-8">
          <p className="text-lg font-black text-gray-900 mb-1.5">Ready to explore?</p>
          <p className="text-gray-400 text-sm mb-6">Your perfect trip starts here.</p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-primary-500 to-teal-500 text-white font-bold px-8 py-3.5 rounded-2xl text-sm shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/35 hover:-translate-y-0.5 transition-all"
          >
            Get Started — it&apos;s free
            <ChevronRight size={15} />
          </Link>
        </div>
      </div>
    </div>
  )
}
