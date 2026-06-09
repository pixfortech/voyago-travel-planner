/**
 * Curated real-place seeds for the trip-generator mock fallback (Phase 15D).
 *
 * The development mock (used when no ANTHROPIC_API_KEY is set) previously emitted
 * generic placeholder titles like "Gangtok sightseeing highlight 1.1". That is
 * never acceptable for a real itinerary. This module provides real, named place
 * candidates for popular destinations so the mock produces believable plans, and
 * a clearly-labelled "needs verification" fallback for unknown destinations.
 *
 * Import-safe on client and server (no secrets, no `server-only`).
 */

import type { ActivityCategory } from '@/types'

export interface CuratedPlace {
  name: string
  category: ActivityCategory
  /** Optional rough time-to-spend hint. */
  timeToSpend?: string
}

/**
 * Destination → ordered list of real, well-known places. Keys are lowercase and
 * matched by substring against the user's destination string.
 */
const CURATED: Record<string, CuratedPlace[]> = {
  gangtok: [
    { name: 'Tashi View Point', category: 'sightseeing', timeToSpend: '30–45 min' },
    { name: 'Ganesh Tok', category: 'spiritual', timeToSpend: '30 min' },
    { name: 'Hanuman Tok', category: 'spiritual', timeToSpend: '30 min' },
    { name: 'Enchey Monastery', category: 'spiritual', timeToSpend: '45 min' },
    { name: 'Ban Jhakri Falls', category: 'sightseeing', timeToSpend: '1 hr' },
    { name: 'MG Marg', category: 'shopping', timeToSpend: '1–2 hrs' },
    { name: 'Gangtok Ropeway', category: 'adventure', timeToSpend: '45 min' },
    { name: 'Flower Exhibition Centre', category: 'sightseeing', timeToSpend: '30 min' },
    { name: 'Rumtek Monastery', category: 'spiritual', timeToSpend: '1–2 hrs' },
    { name: 'Namgyal Institute of Tibetology', category: 'sightseeing', timeToSpend: '1 hr' },
    { name: 'Do Drul Chorten', category: 'spiritual', timeToSpend: '30 min' },
    { name: 'Tsomgo Lake', category: 'sightseeing', timeToSpend: '2–3 hrs' },
  ],
  darjeeling: [
    { name: 'Tiger Hill', category: 'sightseeing', timeToSpend: '1–2 hrs' },
    { name: 'Batasia Loop', category: 'sightseeing', timeToSpend: '45 min' },
    { name: 'Darjeeling Himalayan Railway (Toy Train)', category: 'adventure', timeToSpend: '2 hrs' },
    { name: 'Padmaja Naidu Himalayan Zoological Park', category: 'sightseeing', timeToSpend: '1–2 hrs' },
    { name: 'Peace Pagoda', category: 'spiritual', timeToSpend: '45 min' },
    { name: 'Happy Valley Tea Estate', category: 'sightseeing', timeToSpend: '1 hr' },
    { name: 'Mall Road (Chowrasta)', category: 'shopping', timeToSpend: '1–2 hrs' },
    { name: 'Ghoom Monastery', category: 'spiritual', timeToSpend: '45 min' },
  ],
  goa: [
    { name: 'Baga Beach', category: 'leisure', timeToSpend: '2–3 hrs' },
    { name: 'Calangute Beach', category: 'leisure', timeToSpend: '2 hrs' },
    { name: 'Basilica of Bom Jesus', category: 'spiritual', timeToSpend: '1 hr' },
    { name: 'Fort Aguada', category: 'sightseeing', timeToSpend: '1 hr' },
    { name: 'Dudhsagar Falls', category: 'sightseeing', timeToSpend: '3 hrs' },
    { name: 'Anjuna Flea Market', category: 'shopping', timeToSpend: '1–2 hrs' },
    { name: 'Chapora Fort', category: 'sightseeing', timeToSpend: '1 hr' },
    { name: 'Palolem Beach', category: 'leisure', timeToSpend: '2–3 hrs' },
  ],
  jaipur: [
    { name: 'Amber Fort', category: 'sightseeing', timeToSpend: '2–3 hrs' },
    { name: 'City Palace', category: 'sightseeing', timeToSpend: '2 hrs' },
    { name: 'Hawa Mahal', category: 'sightseeing', timeToSpend: '45 min' },
    { name: 'Jantar Mantar', category: 'sightseeing', timeToSpend: '1 hr' },
    { name: 'Nahargarh Fort', category: 'sightseeing', timeToSpend: '1–2 hrs' },
    { name: 'Jal Mahal', category: 'sightseeing', timeToSpend: '30 min' },
    { name: 'Johari Bazaar', category: 'shopping', timeToSpend: '1–2 hrs' },
    { name: 'Albert Hall Museum', category: 'sightseeing', timeToSpend: '1–2 hrs' },
  ],
  manali: [
    { name: 'Hadimba Devi Temple', category: 'spiritual', timeToSpend: '45 min' },
    { name: 'Solang Valley', category: 'adventure', timeToSpend: '3 hrs' },
    { name: 'Old Manali', category: 'leisure', timeToSpend: '2 hrs' },
    { name: 'Vashisht Hot Springs', category: 'leisure', timeToSpend: '1 hr' },
    { name: 'Mall Road Manali', category: 'shopping', timeToSpend: '1–2 hrs' },
    { name: 'Manu Temple', category: 'spiritual', timeToSpend: '45 min' },
    { name: 'Jogini Falls', category: 'adventure', timeToSpend: '2 hrs' },
  ],
  shimla: [
    { name: 'The Ridge', category: 'sightseeing', timeToSpend: '1 hr' },
    { name: 'Mall Road Shimla', category: 'shopping', timeToSpend: '1–2 hrs' },
    { name: 'Jakhoo Temple', category: 'spiritual', timeToSpend: '1 hr' },
    { name: 'Christ Church', category: 'sightseeing', timeToSpend: '30 min' },
    { name: 'Kufri', category: 'adventure', timeToSpend: '2–3 hrs' },
    { name: 'Viceregal Lodge', category: 'sightseeing', timeToSpend: '1 hr' },
  ],
  udaipur: [
    { name: 'City Palace Udaipur', category: 'sightseeing', timeToSpend: '2 hrs' },
    { name: 'Lake Pichola', category: 'sightseeing', timeToSpend: '1–2 hrs' },
    { name: 'Jag Mandir', category: 'sightseeing', timeToSpend: '1 hr' },
    { name: 'Saheliyon Ki Bari', category: 'sightseeing', timeToSpend: '45 min' },
    { name: 'Fateh Sagar Lake', category: 'leisure', timeToSpend: '1 hr' },
    { name: 'Jagdish Temple', category: 'spiritual', timeToSpend: '45 min' },
    { name: 'Bagore Ki Haveli', category: 'sightseeing', timeToSpend: '1 hr' },
  ],
}

/** Generic interest-based stops used when a destination isn't in the curated set. */
const GENERIC_BY_CATEGORY: Record<string, string[]> = {
  sightseeing: ['city viewpoint', 'historic landmark', 'central square', 'old town walk'],
  spiritual: ['main temple', 'famous monastery', 'historic church'],
  shopping: ['main market', 'local bazaar', 'craft market'],
  adventure: ['adventure activity spot', 'nature trail', 'cable car / ropeway'],
  food: ['popular local restaurant', 'well-known café', 'street-food lane'],
  leisure: ['popular beach / lakefront', 'public garden', 'riverside promenade'],
  nature: ['scenic nature spot', 'waterfall', 'botanical garden'],
}

function normalise(dest: string): string {
  return dest.toLowerCase().trim()
}

/** Returns curated real places for a destination, or null if none are known. */
export function getCuratedPlaces(destination: string): CuratedPlace[] | null {
  const key = normalise(destination)
  for (const [name, places] of Object.entries(CURATED)) {
    if (key.includes(name)) return places
  }
  return null
}

/**
 * Build a generic, clearly-unverified candidate for an unknown destination.
 * These are flagged `needsVerification` so the UI requires Google enrichment
 * before they can be applied — never a fake-looking "highlight 1.1" label.
 */
export function genericCandidate(
  destination: string,
  category: ActivityCategory,
  index: number,
): { title: string; searchQuery: string } {
  const pool = GENERIC_BY_CATEGORY[category] ?? GENERIC_BY_CATEGORY.sightseeing!
  const descriptor = pool[index % pool.length]!
  return {
    // No fake numbered placeholder — a real-sounding search intent the user can verify.
    title: `Top ${descriptor} in ${destination}`,
    searchQuery: `best ${descriptor} in ${destination}`,
  }
}

export function hasCuratedPlaces(destination: string): boolean {
  return getCuratedPlaces(destination) !== null
}
