/**
 * India city / state seed dataset — Phase 16C.
 *
 * A practical (not exhaustive) list of major tourist + business cities. The
 * shape is designed so a fuller dataset can be swapped in later without any
 * UI change. Coordinates are approximate city centres.
 */

export interface IndiaCity {
  city: string
  state: string
  country: 'India'
  lat?: number
  lng?: number
  /** Alternate names / common spellings searched alongside the city name. */
  aliases?: string[]
}

export const INDIA_CITIES: IndiaCity[] = [
  // ── East / North-East ──
  { city: 'Kolkata', state: 'West Bengal', country: 'India', lat: 22.5726, lng: 88.3639, aliases: ['Calcutta'] },
  { city: 'Gangtok', state: 'Sikkim', country: 'India', lat: 27.3389, lng: 88.6065 },
  { city: 'Pelling', state: 'Sikkim', country: 'India', lat: 27.3017, lng: 88.2390 },
  { city: 'Darjeeling', state: 'West Bengal', country: 'India', lat: 27.0360, lng: 88.2627 },
  { city: 'Kalimpong', state: 'West Bengal', country: 'India', lat: 27.0586, lng: 88.4694 },
  { city: 'Siliguri', state: 'West Bengal', country: 'India', lat: 26.7271, lng: 88.3953 },
  { city: 'Digha', state: 'West Bengal', country: 'India', lat: 21.6270, lng: 87.5070 },
  { city: 'Guwahati', state: 'Assam', country: 'India', lat: 26.1445, lng: 91.7362 },
  { city: 'Shillong', state: 'Meghalaya', country: 'India', lat: 25.5788, lng: 91.8933 },
  { city: 'Puri', state: 'Odisha', country: 'India', lat: 19.8135, lng: 85.8312 },
  { city: 'Bhubaneswar', state: 'Odisha', country: 'India', lat: 20.2961, lng: 85.8245 },
  { city: 'Konark', state: 'Odisha', country: 'India', lat: 19.8876, lng: 86.0945 },
  { city: 'Patna', state: 'Bihar', country: 'India', lat: 25.5941, lng: 85.1376 },
  { city: 'Gaya', state: 'Bihar', country: 'India', lat: 24.7969, lng: 84.9994, aliases: ['Bodh Gaya'] },
  { city: 'Ranchi', state: 'Jharkhand', country: 'India', lat: 23.3441, lng: 85.3096 },
  { city: 'Jamshedpur', state: 'Jharkhand', country: 'India', lat: 22.8046, lng: 86.2029 },

  // ── North ──
  { city: 'Delhi', state: 'Delhi', country: 'India', lat: 28.6139, lng: 77.2090, aliases: ['New Delhi'] },
  { city: 'Agra', state: 'Uttar Pradesh', country: 'India', lat: 27.1767, lng: 78.0081 },
  { city: 'Varanasi', state: 'Uttar Pradesh', country: 'India', lat: 25.3176, lng: 82.9739, aliases: ['Banaras', 'Benares', 'Kashi'] },
  { city: 'Lucknow', state: 'Uttar Pradesh', country: 'India', lat: 26.8467, lng: 80.9462 },
  { city: 'Ayodhya', state: 'Uttar Pradesh', country: 'India', lat: 26.7922, lng: 82.1998 },
  { city: 'Mathura', state: 'Uttar Pradesh', country: 'India', lat: 27.4924, lng: 77.6737 },
  { city: 'Jaipur', state: 'Rajasthan', country: 'India', lat: 26.9124, lng: 75.7873, aliases: ['Pink City'] },
  { city: 'Udaipur', state: 'Rajasthan', country: 'India', lat: 24.5854, lng: 73.7125 },
  { city: 'Jodhpur', state: 'Rajasthan', country: 'India', lat: 26.2389, lng: 73.0243, aliases: ['Blue City'] },
  { city: 'Jaisalmer', state: 'Rajasthan', country: 'India', lat: 26.9157, lng: 70.9083, aliases: ['Golden City'] },
  { city: 'Ajmer', state: 'Rajasthan', country: 'India', lat: 26.4499, lng: 74.6399 },
  { city: 'Pushkar', state: 'Rajasthan', country: 'India', lat: 26.4900, lng: 74.5511 },
  { city: 'Amritsar', state: 'Punjab', country: 'India', lat: 31.6340, lng: 74.8723 },
  { city: 'Manali', state: 'Himachal Pradesh', country: 'India', lat: 32.2396, lng: 77.1887 },
  { city: 'Shimla', state: 'Himachal Pradesh', country: 'India', lat: 31.1048, lng: 77.1734 },
  { city: 'Dharamshala', state: 'Himachal Pradesh', country: 'India', lat: 32.2190, lng: 76.3234, aliases: ['McLeod Ganj'] },
  { city: 'Rishikesh', state: 'Uttarakhand', country: 'India', lat: 30.0869, lng: 78.2676 },
  { city: 'Haridwar', state: 'Uttarakhand', country: 'India', lat: 29.9457, lng: 78.1642 },
  { city: 'Dehradun', state: 'Uttarakhand', country: 'India', lat: 30.3165, lng: 78.0322 },
  { city: 'Nainital', state: 'Uttarakhand', country: 'India', lat: 29.3919, lng: 79.4542 },
  { city: 'Mussoorie', state: 'Uttarakhand', country: 'India', lat: 30.4598, lng: 78.0644 },
  { city: 'Srinagar', state: 'Jammu and Kashmir', country: 'India', lat: 34.0837, lng: 74.7973 },
  { city: 'Leh', state: 'Ladakh', country: 'India', lat: 34.1526, lng: 77.5771 },

  // ── West ──
  { city: 'Mumbai', state: 'Maharashtra', country: 'India', lat: 19.0760, lng: 72.8777, aliases: ['Bombay'] },
  { city: 'Pune', state: 'Maharashtra', country: 'India', lat: 18.5204, lng: 73.8567 },
  { city: 'Mahabaleshwar', state: 'Maharashtra', country: 'India', lat: 17.9237, lng: 73.6582 },
  { city: 'Panaji', state: 'Goa', country: 'India', lat: 15.4909, lng: 73.8278, aliases: ['Goa', 'Panjim'] },
  { city: 'Ahmedabad', state: 'Gujarat', country: 'India', lat: 23.0225, lng: 72.5714 },
  { city: 'Vadodara', state: 'Gujarat', country: 'India', lat: 22.3072, lng: 73.1812, aliases: ['Baroda'] },
  { city: 'Surat', state: 'Gujarat', country: 'India', lat: 21.1702, lng: 72.8311 },
  { city: 'Rann of Kutch', state: 'Gujarat', country: 'India', lat: 23.7337, lng: 69.8597, aliases: ['Bhuj'] },

  // ── Central ──
  { city: 'Bhopal', state: 'Madhya Pradesh', country: 'India', lat: 23.2599, lng: 77.4126 },
  { city: 'Indore', state: 'Madhya Pradesh', country: 'India', lat: 22.7196, lng: 75.8577 },
  { city: 'Khajuraho', state: 'Madhya Pradesh', country: 'India', lat: 24.8318, lng: 79.9199 },
  { city: 'Nagpur', state: 'Maharashtra', country: 'India', lat: 21.1458, lng: 79.0882 },

  // ── South ──
  { city: 'Bengaluru', state: 'Karnataka', country: 'India', lat: 12.9716, lng: 77.5946, aliases: ['Bangalore'] },
  { city: 'Mysuru', state: 'Karnataka', country: 'India', lat: 12.2958, lng: 76.6394, aliases: ['Mysore'] },
  { city: 'Hampi', state: 'Karnataka', country: 'India', lat: 15.3350, lng: 76.4600 },
  { city: 'Chennai', state: 'Tamil Nadu', country: 'India', lat: 13.0827, lng: 80.2707, aliases: ['Madras'] },
  { city: 'Madurai', state: 'Tamil Nadu', country: 'India', lat: 9.9252, lng: 78.1198 },
  { city: 'Ooty', state: 'Tamil Nadu', country: 'India', lat: 11.4102, lng: 76.6950, aliases: ['Udhagamandalam'] },
  { city: 'Coimbatore', state: 'Tamil Nadu', country: 'India', lat: 11.0168, lng: 76.9558 },
  { city: 'Puducherry', state: 'Puducherry', country: 'India', lat: 11.9416, lng: 79.8083, aliases: ['Pondicherry'] },
  { city: 'Hyderabad', state: 'Telangana', country: 'India', lat: 17.3850, lng: 78.4867 },
  { city: 'Visakhapatnam', state: 'Andhra Pradesh', country: 'India', lat: 17.6868, lng: 83.2185, aliases: ['Vizag'] },
  { city: 'Tirupati', state: 'Andhra Pradesh', country: 'India', lat: 13.6288, lng: 79.4192 },
  { city: 'Kochi', state: 'Kerala', country: 'India', lat: 9.9312, lng: 76.2673, aliases: ['Cochin', 'Ernakulam'] },
  { city: 'Munnar', state: 'Kerala', country: 'India', lat: 10.0889, lng: 77.0595 },
  { city: 'Alappuzha', state: 'Kerala', country: 'India', lat: 9.4981, lng: 76.3388, aliases: ['Alleppey'] },
  { city: 'Thiruvananthapuram', state: 'Kerala', country: 'India', lat: 8.5241, lng: 76.9366, aliases: ['Trivandrum'] },
]

/** Normalise for case/whitespace-insensitive matching. */
function norm(s: string): string {
  return s.toLowerCase().trim()
}

/**
 * Search cities by city name, state, or alias. Prefix matches on the city name
 * rank first, then substring matches, then state/alias matches.
 */
export function searchCities(query: string, limit = 8): IndiaCity[] {
  const q = norm(query)
  if (q.length < 1) return []
  const scored: { c: IndiaCity; score: number }[] = []
  for (const c of INDIA_CITIES) {
    const city = norm(c.city)
    const state = norm(c.state)
    const aliases = (c.aliases ?? []).map(norm)
    let score = -1
    if (city === q) score = 100
    else if (city.startsWith(q)) score = 80
    else if (aliases.some((a) => a === q || a.startsWith(q))) score = 70
    else if (city.includes(q)) score = 50
    else if (aliases.some((a) => a.includes(q))) score = 40
    else if (state.startsWith(q)) score = 30
    else if (state.includes(q)) score = 20
    if (score >= 0) scored.push({ c, score })
  }
  return scored
    .sort((a, b) => b.score - a.score || a.c.city.localeCompare(b.c.city))
    .slice(0, limit)
    .map((s) => s.c)
}
