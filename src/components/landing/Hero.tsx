'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Sparkles, ChevronRight, Lock, Wallet, Share2, CalendarDays,
  MapPin, Camera, Users, Zap, Brain, Route,
} from 'lucide-react'

// ─── Data ────────────────────────────────────────────────────────────────────

const tripTypes = [
  { label: 'Goa',       sub: 'Beach Escape',  from: 'from-cyan-400',    to: 'to-blue-500',    emoji: '🌴' },
  { label: 'Rajasthan', sub: 'Heritage Tour', from: 'from-amber-400',   to: 'to-orange-500',  emoji: '🏰' },
  { label: 'Kerala',    sub: 'Backwaters',    from: 'from-emerald-400', to: 'to-teal-500',    emoji: '🌊' },
  { label: 'Himachal',  sub: 'Hill Station',  from: 'from-blue-500',    to: 'to-indigo-600',  emoji: '🏔️' },
  { label: 'Varanasi',  sub: 'Pilgrimage',    from: 'from-amber-500',   to: 'to-yellow-500',  emoji: '🛕' },
  { label: 'Andaman',   sub: 'Island Trip',   from: 'from-pink-400',    to: 'to-rose-500',    emoji: '🐚' },
  { label: 'Ladakh',    sub: 'Road Trip',     from: 'from-violet-500',  to: 'to-purple-600',  emoji: '⛰️' },
  { label: 'Mumbai',    sub: 'City Break',    from: 'from-red-400',     to: 'to-orange-500',  emoji: '🌆' },
]

const features = [
  {
    icon: <CalendarDays size={22} />,
    title: 'Day-wise Itinerary',
    desc: 'Plan every activity, meal and hotel per day.',
    iconBg: 'bg-gradient-to-br from-primary-500 to-teal-500',
    cardBg: 'bg-gradient-to-br from-primary-50 to-teal-50',
  },
  {
    icon: <Wallet size={22} />,
    title: 'Budget Tracker',
    desc: 'Track spending by category and stay on budget.',
    iconBg: 'bg-gradient-to-br from-amber-400 to-orange-500',
    cardBg: 'bg-gradient-to-br from-amber-50 to-orange-50',
  },
  {
    icon: <Share2 size={22} />,
    title: 'Share & Export',
    desc: 'Export or share your full trip plan with anyone.',
    iconBg: 'bg-gradient-to-br from-violet-500 to-purple-500',
    cardBg: 'bg-gradient-to-br from-violet-50 to-purple-50',
  },
  {
    icon: <MapPin size={22} />,
    title: 'Trip Notes',
    desc: 'Save addresses, bookings and travel tips.',
    iconBg: 'bg-gradient-to-br from-rose-400 to-pink-500',
    cardBg: 'bg-gradient-to-br from-rose-50 to-pink-50',
  },
]

const comingSoon = [
  {
    icon: <Brain size={22} />,
    title: 'AI Trip Generator',
    desc: 'Describe your dream trip and let AI build a complete itinerary in seconds.',
    iconBg: 'bg-gradient-to-br from-violet-500 to-purple-600',
  },
  {
    icon: <Route size={22} />,
    title: 'Google Maps Routing',
    desc: 'See travel times, distances, and optimised day routes on interactive maps.',
    iconBg: 'bg-gradient-to-br from-blue-500 to-cyan-500',
  },
  {
    icon: <Camera size={22} />,
    title: 'Travel Photos',
    desc: 'Capture memories and organise photos by day and destination.',
    iconBg: 'bg-gradient-to-br from-rose-400 to-pink-500',
  },
  {
    icon: <Users size={22} />,
    title: 'Collaboration',
    desc: 'Plan together with your travel companions in real time.',
    iconBg: 'bg-gradient-to-br from-amber-400 to-orange-500',
  },
]

// ─── Hero trip card visual mockup ─────────────────────────────────────────────

function HeroTripCard() {
  return (
    <div className="relative w-full max-w-sm mx-auto lg:mx-0 lg:max-w-none select-none">
      {/* Decorative background cards */}
      <div className="absolute inset-8 bg-gradient-to-br from-violet-400 to-purple-600 rounded-3xl rotate-6 opacity-25" />
      <div className="absolute inset-4 bg-gradient-to-br from-primary-400 to-teal-500 rounded-3xl rotate-2 opacity-40" />

      {/* Main mock card */}
      <div className="relative bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="h-2.5 bg-gradient-to-r from-amber-400 to-orange-500" />
        <div className="p-5 lg:p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">
                Friends Trip
              </p>
              <p className="text-lg font-black text-gray-900 mt-0.5">Rajasthan Diaries</p>
            </div>
            <span className="text-xs font-bold bg-amber-50 text-amber-600 px-3 py-1 rounded-full flex-shrink-0">
              8 days
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            {[['Budget', '₹80,000'], ['Days', '8'], ['Stops', '12']].map(([l, v]) => (
              <div key={l} className="bg-gray-50 rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-gray-400 mb-0.5">{l}</p>
                <p className="text-sm font-black text-gray-900">{v}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            {[
              'Heritage Haveli Check-in, Jaipur',
              'Amber Fort & City Palace Tour',
              'Sunset at Mehrangarh, Jodhpur',
            ].map((a, i) => (
              <div key={i} className="flex items-center gap-2.5 bg-gray-50 rounded-xl px-3 py-2">
                <div className="w-1.5 h-1.5 bg-amber-400 rounded-full flex-shrink-0" />
                <span className="text-xs text-gray-700 truncate">{a}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating budget badge */}
      <div className="absolute -bottom-3 -right-3 bg-white rounded-2xl shadow-xl px-4 py-3 text-center border border-gray-50">
        <p className="text-[10px] text-gray-400 mb-0.5">Budget left</p>
        <p className="text-xl font-black text-green-500">₹32,400</p>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Hero() {
  return (
    <div className="bg-[#08111f]">
      {/* Sticky nav */}
      <nav className="sticky top-0 z-50 bg-[#08111f]/90 backdrop-blur-md border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 h-14 flex items-center justify-between">
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
        </div>
      </nav>

      {/* ── Hero section ── */}
      <section className="relative min-h-[85vh] flex items-center overflow-hidden py-16 lg:py-24">
        {/* Ambient gradient blobs */}
        <div className="absolute -top-60 -left-60 w-[700px] h-[700px] bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-60 -right-60 w-[700px] h-[700px] bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 left-1/3 w-80 h-80 bg-violet-600/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 lg:px-8 w-full flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
          {/* Left: copy — no opacity-0 initial so page is never blank */}
          <motion.div
            initial={{ y: 20 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1 text-center lg:text-left"
          >
            <div className="inline-flex items-center gap-2 bg-primary-500/10 border border-primary-500/25 text-primary-400 text-xs font-bold px-4 py-2 rounded-full mb-6 tracking-widest uppercase">
              <Sparkles size={11} />
              India&apos;s Travel Planner
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black text-white leading-[1.05] mb-5 tracking-tight">
              Plan your perfect
              <br />
              <span className="bg-gradient-to-r from-primary-400 to-teal-300 bg-clip-text text-transparent">
                Indian trip
              </span>
            </h1>

            <p className="text-white/55 text-base lg:text-lg leading-relaxed mb-9 max-w-lg mx-auto lg:mx-0">
              From Goa beaches to Himalayan peaks — build day-by-day itineraries, track your budget
              in ₹, and keep all your travel details in one beautiful place.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 mb-10">
              <Link
                href="/dashboard"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-gradient-to-r from-primary-500 to-teal-500 text-white font-bold px-8 py-4 rounded-2xl text-base shadow-xl shadow-primary-500/30 hover:shadow-2xl hover:shadow-primary-500/40 hover:-translate-y-0.5 transition-all"
              >
                <Zap size={18} />
                Start Planning Free
              </Link>
            </div>

            <div className="flex items-center justify-center lg:justify-start gap-10 pt-8 border-t border-white/10">
              {[
                { value: '12+', label: 'Destinations' },
                { value: '₹', label: 'INR Native' },
                { value: 'Free', label: 'Forever' },
              ].map((s) => (
                <div key={s.label} className="text-center lg:text-left">
                  <p className="text-2xl font-black text-white">{s.value}</p>
                  <p className="text-xs text-white/35 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right: hero visual */}
          <motion.div
            initial={{ x: 24, scale: 0.97 }}
            animate={{ x: 0, scale: 1 }}
            transition={{ duration: 0.65, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="w-full lg:w-[400px] xl:w-[440px] flex-shrink-0 pb-6"
          >
            <HeroTripCard />
          </motion.div>
        </div>
      </section>

      {/* ── White content area ── */}
      <div className="bg-white">

        {/* Features */}
        <section className="max-w-7xl mx-auto px-4 lg:px-8 py-16 lg:py-24">
          <div className="text-center mb-12">
            <p className="text-xs font-black text-primary-500 uppercase tracking-widest mb-2">
              What&apos;s Included
            </p>
            <h2 className="text-3xl lg:text-4xl font-black text-gray-900">Everything you need</h2>
            <p className="text-gray-400 text-base mt-2">All core features are free, forever.</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.07 * i }}
                className={`${f.cardBg} rounded-2xl p-5`}
              >
                <div
                  className={`w-11 h-11 ${f.iconBg} rounded-xl flex items-center justify-center text-white mb-4 shadow-md`}
                >
                  {f.icon}
                </div>
                <p className="text-sm font-bold text-gray-900 leading-tight mb-1">{f.title}</p>
                <p className="text-xs text-gray-500 leading-snug">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* India destinations */}
        <section className="bg-gray-50 py-16 lg:py-20">
          <div className="max-w-7xl mx-auto px-4 lg:px-8">
            <div className="text-center mb-10">
              <p className="text-xs font-black text-primary-500 uppercase tracking-widest mb-2">
                Explore Incredible India
              </p>
              <h2 className="text-3xl lg:text-4xl font-black text-gray-900">
                Where are you headed?
              </h2>
              <p className="text-gray-400 text-base mt-2">
                Plan any trip across India — from mountains to beaches.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-4">
              {tripTypes.map((t, i) => (
                <motion.div
                  key={t.label}
                  initial={{ opacity: 0, scale: 0.93 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.05 * i }}
                  className={`bg-gradient-to-br ${t.from} ${t.to} rounded-2xl p-5 lg:p-6 text-white cursor-pointer hover:-translate-y-1 hover:shadow-xl transition-all duration-200`}
                >
                  <div className="text-3xl lg:text-4xl mb-2 lg:mb-3" aria-hidden="true">
                    {t.emoji}
                  </div>
                  <p className="text-sm lg:text-base font-bold leading-tight">{t.label}</p>
                  <p className="text-xs text-white/70 mt-0.5">{t.sub}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Coming soon */}
        <section className="max-w-7xl mx-auto px-4 lg:px-8 py-16 lg:py-24">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-1.5 bg-primary-50 text-primary-600 text-xs font-black px-3 py-1.5 rounded-full mb-4">
              <Lock size={10} />
              Coming Soon
            </div>
            <h2 className="text-3xl lg:text-4xl font-black text-gray-900">Next-level features</h2>
            <p className="text-gray-400 text-base mt-2">
              AI and collaboration tools, arriving soon.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {comingSoon.map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.08 * i }}
                className="bg-gradient-to-br from-gray-900 to-[#0f1a2e] rounded-2xl p-6"
              >
                <div
                  className={`w-11 h-11 ${item.iconBg} rounded-xl flex items-center justify-center text-white mb-4 shadow-lg`}
                >
                  {item.icon}
                </div>
                <p className="text-sm font-bold text-white mb-1.5">{item.title}</p>
                <p className="text-xs text-white/45 leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="bg-gradient-to-br from-primary-700 via-primary-500 to-teal-500 py-16 lg:py-24">
          <div className="max-w-7xl mx-auto px-4 lg:px-8 text-center">
            <h2 className="text-3xl lg:text-4xl font-black text-white mb-3">
              Ready to explore India?
            </h2>
            <p className="text-white/70 text-base mb-8 max-w-md mx-auto">
              Your perfect trip starts here. Free forever.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 bg-white text-primary-600 font-bold px-8 py-4 rounded-2xl text-base shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all"
            >
              Get Started Free <ChevronRight size={16} />
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
