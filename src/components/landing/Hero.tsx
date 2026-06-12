'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Sparkles, ChevronRight, Wallet, Share2, CalendarDays,
  MapPin, Zap, Brain, Route, Camera, Users,
} from 'lucide-react'

// ─── Destination cards ────────────────────────────────────────────────────────

const destinations = [
  { label: 'Goa',       sub: 'Beach Escape',  color: '#0EA5E9', emoji: '🌴' },
  { label: 'Rajasthan', sub: 'Heritage Tour', color: '#F59E0B', emoji: '🏰' },
  { label: 'Kerala',    sub: 'Backwaters',    color: '#10B981', emoji: '🌊' },
  { label: 'Himachal',  sub: 'Hill Station',  color: '#6366F1', emoji: '🏔️' },
  { label: 'Varanasi',  sub: 'Pilgrimage',    color: '#F97316', emoji: '🛕' },
  { label: 'Andaman',   sub: 'Island Trip',   color: '#EC4899', emoji: '🐚' },
  { label: 'Ladakh',    sub: 'Road Trip',     color: '#8B5CF6', emoji: '⛰️' },
  { label: 'Mumbai',    sub: 'City Break',    color: '#EF4444', emoji: '🌆' },
]

const features = [
  {
    icon: <CalendarDays size={20} />,
    title: 'Day-wise Itinerary',
    desc: 'Plan every activity, meal and hotel per day.',
    accent: '#14b8a6',
  },
  {
    icon: <Wallet size={20} />,
    title: 'Budget Tracker',
    desc: 'Track spending by category and stay on budget.',
    accent: '#F59E0B',
  },
  {
    icon: <Share2 size={20} />,
    title: 'Share & Export',
    desc: 'Export or share your full trip plan with anyone.',
    accent: '#8B5CF6',
  },
  {
    icon: <MapPin size={20} />,
    title: 'Trip Notes',
    desc: 'Save addresses, bookings and travel tips.',
    accent: '#EC4899',
  },
]

const upcomingFeatures = [
  {
    icon: <Brain size={20} />,
    title: 'AI Trip Generator',
    desc: 'Describe your dream trip and let AI build a complete itinerary in seconds.',
    accent: '#8B5CF6',
  },
  {
    icon: <Route size={20} />,
    title: 'Maps Routing',
    desc: 'See travel times, distances, and optimised day routes on interactive maps.',
    accent: '#0EA5E9',
  },
  {
    icon: <Camera size={20} />,
    title: 'Travel Photos',
    desc: 'Capture memories and organise photos by day and destination.',
    accent: '#EC4899',
  },
  {
    icon: <Users size={20} />,
    title: 'Collaboration',
    desc: 'Plan together with your travel companions in real time.',
    accent: '#F59E0B',
  },
]

// ─── Hero trip card mockup ────────────────────────────────────────────────────

function HeroCard() {
  return (
    <div className="relative w-full max-w-sm mx-auto lg:mx-0 lg:max-w-none select-none">
      {/* Subtle glow behind card */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary-500/20 to-teal-400/20 rounded-3xl blur-2xl scale-95" />

      <div className="relative bg-white/10 backdrop-blur-xl rounded-2xl border border-white/15 overflow-hidden">
        {/* Header stripe */}
        <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-400" />

        <div className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold text-amber-400/80 uppercase tracking-widest">
                Friends Trip
              </p>
              <p className="text-base font-bold text-white mt-0.5">Rajasthan Diaries</p>
            </div>
            <span className="text-xs font-semibold bg-amber-400/15 text-amber-300 px-2.5 py-1 rounded-full">
              8 days
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            {[['Budget', '₹80k'], ['Days', '8'], ['Stops', '12']].map(([l, v]) => (
              <div key={l} className="bg-white/[0.07] rounded-xl p-2.5 text-center">
                <p className="text-[9px] text-white/40 mb-0.5">{l}</p>
                <p className="text-sm font-bold text-white">{v}</p>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            {[
              'Heritage Haveli Check-in, Jaipur',
              'Amber Fort & City Palace Tour',
              'Sunset at Mehrangarh, Jodhpur',
            ].map((a, i) => (
              <div key={i} className="flex items-center gap-2 bg-white/[0.06] rounded-lg px-3 py-2">
                <div className="w-1.5 h-1.5 bg-amber-400 rounded-full flex-shrink-0" />
                <span className="text-[11px] text-white/70 truncate">{a}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating stat */}
      <div className="absolute -bottom-3 -right-2 bg-white rounded-xl shadow-xl px-4 py-2.5 text-center">
        <p className="text-[9px] text-gray-400 mb-0.5">Budget left</p>
        <p className="text-lg font-black text-emerald-500">₹32,400</p>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Hero() {
  return (
    <div className="bg-[#0C1018]">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-[#0C1018]/95 backdrop-blur-md border-b border-white/[0.05]">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-baseline gap-0">
            <span className="text-[17px] font-black bg-gradient-to-r from-primary-400 to-teal-400 bg-clip-text text-transparent tracking-tight">
              Voya
            </span>
            <span className="text-[17px] font-black text-white tracking-tight">GO</span>
          </div>
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-sm font-semibold text-white/60 hover:text-white transition-colors"
          >
            My Trips <ChevronRight size={14} />
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative min-h-[86vh] flex items-center overflow-hidden py-16 lg:py-24">
        {/* Ambient blobs */}
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-primary-600/8 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] bg-teal-500/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 lg:px-8 w-full flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
          {/* Left — copy */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1 text-center lg:text-left"
          >
            <div className="inline-flex items-center gap-2 bg-white/[0.07] border border-white/10 text-white/60 text-[11px] font-semibold px-3.5 py-1.5 rounded-full mb-6 tracking-wider uppercase">
              <Sparkles size={11} className="text-primary-400" />
              India&apos;s Travel Planner
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.06] mb-5 tracking-tight">
              Plan your perfect
              <br />
              <span className="bg-gradient-to-r from-primary-400 to-teal-300 bg-clip-text text-transparent">
                Indian trip
              </span>
            </h1>

            <p className="text-white/50 text-base lg:text-lg leading-relaxed mb-9 max-w-md mx-auto lg:mx-0">
              From Goa beaches to Himalayan peaks — build day-by-day itineraries, track your budget
              in ₹, and keep all your travel details in one place.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 mb-10">
              <Link
                href="/dashboard"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-gradient-to-r from-primary-500 to-teal-500 text-white font-bold px-7 py-3.5 rounded-xl text-sm shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/35 hover:-translate-y-0.5 transition-all"
              >
                <Zap size={16} />
                Start Planning Free
              </Link>
              <Link
                href="/trips/new/ai-generator"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-white/[0.08] border border-white/15 text-white font-semibold px-7 py-3.5 rounded-xl text-sm hover:bg-white/[0.12] transition-all"
              >
                <Sparkles size={16} className="text-violet-400" />
                Try AI Generator
              </Link>
            </div>

            <div className="flex items-center justify-center lg:justify-start gap-8 pt-7 border-t border-white/[0.08]">
              {[
                { value: '12+', label: 'Destinations' },
                { value: '₹', label: 'INR Native' },
                { value: 'Free', label: 'Always' },
              ].map((s) => (
                <div key={s.label} className="text-center lg:text-left">
                  <p className="text-xl font-black text-white">{s.value}</p>
                  <p className="text-[11px] text-white/30 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right — card visual */}
          <motion.div
            initial={{ opacity: 0, x: 24, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.65, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="w-full lg:w-[380px] xl:w-[420px] flex-shrink-0 pb-6"
          >
            <HeroCard />
          </motion.div>
        </div>
      </section>

      {/* ── White content area ── */}
      <div className="bg-white">

        {/* Features */}
        <section className="max-w-7xl mx-auto px-4 lg:px-8 py-16 lg:py-24">
          <div className="text-center mb-12">
            <p className="text-xs font-bold text-primary-500 uppercase tracking-widest mb-2">
              What&apos;s Included
            </p>
            <h2 className="text-2xl lg:text-3xl font-black text-gray-900">Everything you need</h2>
            <p className="text-gray-400 text-sm mt-2">All core features are free, forever.</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.07 * i }}
                className="bg-stone-50 border border-stone-100 rounded-xl p-5 hover:border-stone-200 transition-colors"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white mb-4 shadow-sm"
                  style={{ backgroundColor: f.accent }}
                >
                  {f.icon}
                </div>
                <p className="text-sm font-bold text-gray-900 leading-tight mb-1">{f.title}</p>
                <p className="text-xs text-gray-500 leading-snug">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Destinations */}
        <section className="bg-stone-50 py-16 lg:py-20">
          <div className="max-w-7xl mx-auto px-4 lg:px-8">
            <div className="text-center mb-10">
              <p className="text-xs font-bold text-primary-500 uppercase tracking-widest mb-2">
                Explore Incredible India
              </p>
              <h2 className="text-2xl lg:text-3xl font-black text-gray-900">
                Where are you headed?
              </h2>
              <p className="text-gray-400 text-sm mt-2">
                Plan any trip across India — mountains to beaches.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {destinations.map((d, i) => (
                <motion.div
                  key={d.label}
                  initial={{ opacity: 0, scale: 0.94 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.05 * i }}
                  className="relative overflow-hidden rounded-xl p-5 text-white cursor-pointer hover:-translate-y-1 hover:shadow-lg transition-all duration-200 group"
                  style={{ backgroundColor: d.color }}
                >
                  <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
                  <div className="relative">
                    <div className="text-3xl mb-2" aria-hidden="true">{d.emoji}</div>
                    <p className="text-sm font-bold leading-tight">{d.label}</p>
                    <p className="text-[11px] text-white/70 mt-0.5">{d.sub}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Coming soon */}
        <section className="max-w-7xl mx-auto px-4 lg:px-8 py-16 lg:py-24">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-1.5 bg-violet-50 text-violet-600 text-xs font-bold px-3 py-1.5 rounded-full mb-4">
              <Sparkles size={11} />
              Coming Soon
            </div>
            <h2 className="text-2xl lg:text-3xl font-black text-gray-900">Next-level features</h2>
            <p className="text-gray-400 text-sm mt-2">AI and collaboration tools, arriving soon.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {upcomingFeatures.map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.08 * i }}
                className="bg-[#0C1018] rounded-xl p-5 border border-white/[0.06]"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white mb-4 shadow-md"
                  style={{ backgroundColor: item.accent }}
                >
                  {item.icon}
                </div>
                <p className="text-sm font-bold text-white mb-1.5">{item.title}</p>
                <p className="text-xs text-white/40 leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="bg-gradient-to-br from-primary-700 via-primary-600 to-teal-600 py-16 lg:py-20">
          <div className="max-w-7xl mx-auto px-4 lg:px-8 text-center">
            <h2 className="text-2xl lg:text-3xl font-black text-white mb-3">
              Ready to explore India?
            </h2>
            <p className="text-white/70 text-sm mb-8 max-w-sm mx-auto">
              Your perfect trip starts here. Free forever.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 bg-white text-primary-600 font-bold px-7 py-3.5 rounded-xl text-sm shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all"
            >
              Get Started Free <ChevronRight size={15} />
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
