import type { ActivityCategory } from '@/types'

export type DurationConfidence = 'high' | 'medium' | 'low'

export interface DurationEstimate {
  minutes: number
  confidence: DurationConfidence
  reason: string
}

/** Parse AI timeToSpend string like "1–2 hrs", "45–60 min", "2 hrs" → average minutes. */
export function parseTimeToSpend(ts: string | undefined): number | null {
  if (!ts) return null
  const s = ts.toLowerCase().replace(/[–—]/g, '-').trim()
  const hrRange = s.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*h/)
  if (hrRange) return Math.round((parseFloat(hrRange[1]!) + parseFloat(hrRange[2]!)) / 2 * 60)
  const singleHr = s.match(/(\d+(?:\.\d+)?)\s*h/)
  if (singleHr) return Math.round(parseFloat(singleHr[1]!) * 60)
  const minRange = s.match(/(\d+)\s*-\s*(\d+)\s*min/)
  if (minRange) return Math.round((parseInt(minRange[1]!) + parseInt(minRange[2]!)) / 2)
  const singleMin = s.match(/(\d+)\s*min/)
  if (singleMin) return parseInt(singleMin[1]!)
  return null
}

function practicalMin(category: ActivityCategory, title: string): number {
  if (category === 'hotel') return 0
  if (category === 'food') return 25
  const t = title.toLowerCase()
  if (t.includes('viewpoint') || t.includes('view point')) return 20
  if (t.includes('monastery') || t.includes('temple') || t.includes('church') || t.includes('gompa')) return 30
  if (t.includes('museum') || t.includes('gallery')) return 40
  if (t.includes('fort') || t.includes('palace') || t.includes('mahal')) return 40
  return 15
}

function categoryDefault(category: ActivityCategory, title: string, mealType?: string): number {
  const t = title.toLowerCase()
  switch (category) {
    case 'hotel': return 0
    case 'transport': return 30
    case 'food':
      if (mealType === 'snack' || mealType === 'cafe') return 35
      if (mealType === 'breakfast') return 40
      return 55
    case 'shopping':
      return t.includes('market') || t.includes('bazaar') ? 75 : 65
    case 'adventure': return 90
    case 'spiritual':
      return t.includes('temple') || t.includes('mandir') || t.includes('shrine') ? 60 : 70
    case 'leisure': return 60
    case 'sightseeing':
      if (t.includes('viewpoint') || t.includes('view point') || t.includes(' view')) return 40
      if (t.includes('monastery') || t.includes('gompa') || t.includes('church')) return 65
      if (t.includes('temple') || t.includes('mandir')) return 55
      if (t.includes('museum') || t.includes('gallery') || t.includes('heritage')) return 75
      if (t.includes('market') || t.includes('bazaar') || t.includes('mall')) return 70
      if (t.includes('fort') || t.includes('palace') || t.includes('mahal')) return 90
      if (t.includes('lake') || t.includes('waterfall') || t.includes('falls')) return 55
      if (t.includes('park') || t.includes('garden') || t.includes('forest') || t.includes('sanctuary')) return 60
      if (t.includes('marg') || t.includes('mall road') || t.includes('ridge')) return 50
      return 55
    default: return 50
  }
}

export function getDurationEstimate(
  category: ActivityCategory,
  title: string,
  timeToSpend: string | undefined,
  mealType?: string,
): DurationEstimate {
  if (category === 'hotel') return { minutes: 0, confidence: 'high', reason: 'Base/stay marker' }

  const aiMins = parseTimeToSpend(timeToSpend)
  const defaultMins = categoryDefault(category, title, mealType)
  const minMins = practicalMin(category, title)

  if (aiMins !== null) {
    if (aiMins < minMins) {
      return { minutes: minMins, confidence: 'medium', reason: `Raised from AI (${aiMins} min < minimum ${minMins} min)` }
    }
    if (aiMins > 180 && category !== 'adventure' && category !== 'leisure') {
      return { minutes: aiMins, confidence: 'low', reason: 'AI estimate (unusually long — verify)' }
    }
    return { minutes: aiMins, confidence: 'high', reason: 'From AI time estimate' }
  }

  return { minutes: defaultMins, confidence: 'medium', reason: 'Category/type default' }
}

// ── Timing engine ──────────────────────────────────────────────────────────────

export interface ActivityTiming {
  key: string
  durationMins: number
  plannedStart: string  // HH:MM
  plannedEnd: string    // HH:MM
}

export interface DayTimingSummary {
  dayStart: string      // HH:MM
  dayEnd: string        // HH:MM
  activityMins: number
  travelMins: number
  totalMins: number
  paceWarning?: string
}

function minsToHHMM(totalMins: number): string {
  const h = Math.floor(totalMins / 60) % 24
  const m = totalMins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function fmtMins(mins: number): string {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`
}

export function parseHHMM(s: string | undefined): number | null {
  if (!s) return null
  const match = s.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const h = parseInt(match[1]!)
  const m = parseInt(match[2]!)
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}

interface LegInfo {
  fromKey: string
  travelMins: number
}

/**
 * Build planned start/end times for all non-removed activities in order, threading
 * in activity duration and inter-stop travel time.
 */
export function buildDayTiming(
  activities: Array<{ key: string; durationMins: number; isBase?: boolean }>,
  legs: LegInfo[],
  dayStartMinutes: number,
): { timings: ActivityTiming[]; summary: DayTimingSummary } {
  const legByFrom = new Map(legs.map((l) => [l.fromKey, l]))
  let cursor = dayStartMinutes
  let totalActivityMins = 0
  let totalTravelMins = 0
  const timings: ActivityTiming[] = []

  for (const act of activities) {
    const dur = act.isBase ? 0 : act.durationMins
    timings.push({
      key: act.key,
      durationMins: dur,
      plannedStart: minsToHHMM(cursor),
      plannedEnd: minsToHHMM(cursor + dur),
    })
    if (dur > 0) {
      totalActivityMins += dur
      cursor += dur
    }
    const leg = legByFrom.get(act.key)
    if (leg && leg.travelMins > 0) {
      totalTravelMins += leg.travelMins
      cursor += leg.travelMins
    }
  }

  const totalMins = totalActivityMins + totalTravelMins
  let paceWarning: string | undefined
  if (totalMins > 600) paceWarning = 'This day is likely overloaded — consider removing a stop.'
  else if (totalMins > 510) paceWarning = 'This is a busy day. Allow flexibility for delays.'
  else if (totalMins > 420) paceWarning = 'This is a full day. Consider a rest break.'

  return {
    timings,
    summary: {
      dayStart: minsToHHMM(dayStartMinutes),
      dayEnd: minsToHHMM(cursor),
      activityMins: totalActivityMins,
      travelMins: totalTravelMins,
      totalMins,
      paceWarning,
    },
  }
}
