/**
 * India railway station seed dataset — Phase 16C.
 *
 * Major stations relevant to tourist/business travel. Not exhaustive; the shape
 * is designed so a fuller dataset can be swapped in later without UI changes.
 * Used as geographic context now; wired into transport budget in Phase 16H.
 */

export interface IndiaRailwayStation {
  name: string
  code: string
  city: string
  state: string
  lat?: number
  lng?: number
  aliases?: string[]
}

export const INDIA_RAILWAY_STATIONS: IndiaRailwayStation[] = [
  // ── Kolkata / North Bengal ──
  { name: 'Howrah Junction', code: 'HWH', city: 'Kolkata', state: 'West Bengal', lat: 22.5839, lng: 88.3425 },
  { name: 'Sealdah', code: 'SDAH', city: 'Kolkata', state: 'West Bengal', lat: 22.5675, lng: 88.3700 },
  { name: 'Kolkata', code: 'KOAA', city: 'Kolkata', state: 'West Bengal', lat: 22.5980, lng: 88.3700, aliases: ['Chitpur'] },
  { name: 'New Jalpaiguri', code: 'NJP', city: 'Siliguri', state: 'West Bengal', lat: 26.6855, lng: 88.3920, aliases: ['NJP', 'Siliguri'] },
  { name: 'Asansol Junction', code: 'ASN', city: 'Asansol', state: 'West Bengal', lat: 23.6850, lng: 86.9760 },
  { name: 'Durgapur', code: 'DGR', city: 'Durgapur', state: 'West Bengal', lat: 23.5300, lng: 87.2920 },
  { name: 'Malda Town', code: 'MLDT', city: 'Malda', state: 'West Bengal', lat: 25.0090, lng: 88.1440 },

  // ── Delhi ──
  { name: 'New Delhi', code: 'NDLS', city: 'New Delhi', state: 'Delhi', lat: 28.6430, lng: 77.2190 },
  { name: 'Delhi Junction', code: 'DLI', city: 'Delhi', state: 'Delhi', lat: 28.6610, lng: 77.2270, aliases: ['Old Delhi'] },
  { name: 'Hazrat Nizamuddin', code: 'NZM', city: 'New Delhi', state: 'Delhi', lat: 28.5880, lng: 77.2510 },

  // ── Mumbai ──
  { name: 'Chhatrapati Shivaji Maharaj Terminus', code: 'CSMT', city: 'Mumbai', state: 'Maharashtra', lat: 18.9398, lng: 72.8355, aliases: ['VT', 'Victoria Terminus', 'Bombay VT'] },
  { name: 'Lokmanya Tilak Terminus', code: 'LTT', city: 'Mumbai', state: 'Maharashtra', lat: 19.0660, lng: 72.8997, aliases: ['Kurla'] },
  { name: 'Mumbai Central', code: 'BCT', city: 'Mumbai', state: 'Maharashtra', lat: 18.9712, lng: 72.8194 },

  // ── South ──
  { name: 'KSR Bengaluru City Junction', code: 'SBC', city: 'Bengaluru', state: 'Karnataka', lat: 12.9783, lng: 77.5713, aliases: ['Bangalore City', 'KSR Bengaluru'] },
  { name: 'Chennai Central', code: 'MAS', city: 'Chennai', state: 'Tamil Nadu', lat: 13.0827, lng: 80.2755, aliases: ['MGR Chennai Central'] },
  { name: 'Hyderabad Deccan', code: 'HYB', city: 'Hyderabad', state: 'Telangana', lat: 17.3850, lng: 78.4750, aliases: ['Nampally'] },
  { name: 'Secunderabad Junction', code: 'SC', city: 'Secunderabad', state: 'Telangana', lat: 17.4339, lng: 78.5018 },
  { name: 'Thiruvananthapuram Central', code: 'TVC', city: 'Thiruvananthapuram', state: 'Kerala', lat: 8.4880, lng: 76.9520, aliases: ['Trivandrum'] },
  { name: 'Ernakulam Junction', code: 'ERS', city: 'Kochi', state: 'Kerala', lat: 9.9700, lng: 76.2870, aliases: ['Cochin', 'Ernakulam South'] },
  { name: 'Madurai Junction', code: 'MDU', city: 'Madurai', state: 'Tamil Nadu', lat: 9.9180, lng: 78.1210 },

  // ── Rajasthan ──
  { name: 'Jaipur Junction', code: 'JP', city: 'Jaipur', state: 'Rajasthan', lat: 26.9196, lng: 75.7878 },
  { name: 'Ajmer Junction', code: 'AII', city: 'Ajmer', state: 'Rajasthan', lat: 26.4710, lng: 74.6410 },
  { name: 'Jodhpur Junction', code: 'JU', city: 'Jodhpur', state: 'Rajasthan', lat: 26.2960, lng: 73.0290 },
  { name: 'Udaipur City', code: 'UDZ', city: 'Udaipur', state: 'Rajasthan', lat: 24.5810, lng: 73.6920 },

  // ── East / Odisha / North-East ──
  { name: 'Puri', code: 'PURI', city: 'Puri', state: 'Odisha', lat: 19.8050, lng: 85.8290 },
  { name: 'Bhubaneswar', code: 'BBS', city: 'Bhubaneswar', state: 'Odisha', lat: 20.2700, lng: 85.8400 },
  { name: 'Guwahati', code: 'GHY', city: 'Guwahati', state: 'Assam', lat: 26.1820, lng: 91.7460 },

  // ── North / Central ──
  { name: 'Kanpur Central', code: 'CNB', city: 'Kanpur', state: 'Uttar Pradesh', lat: 26.4540, lng: 80.3500 },
  { name: 'Dhanbad Junction', code: 'DHN', city: 'Dhanbad', state: 'Jharkhand', lat: 23.7950, lng: 86.4300 },
  { name: 'Varanasi Junction', code: 'BSB', city: 'Varanasi', state: 'Uttar Pradesh', lat: 25.3270, lng: 82.9870, aliases: ['Banaras', 'Kashi'] },
  { name: 'Lucknow Charbagh', code: 'LKO', city: 'Lucknow', state: 'Uttar Pradesh', lat: 26.8310, lng: 80.9210, aliases: ['Charbagh'] },
  { name: 'Agra Cantt', code: 'AGC', city: 'Agra', state: 'Uttar Pradesh', lat: 27.1570, lng: 77.9930 },
  { name: 'Patna Junction', code: 'PNBE', city: 'Patna', state: 'Bihar', lat: 25.6020, lng: 85.1410 },
  { name: 'Gaya Junction', code: 'GAYA', city: 'Gaya', state: 'Bihar', lat: 24.7980, lng: 85.0020 },
  { name: 'Ranchi Junction', code: 'RNC', city: 'Ranchi', state: 'Jharkhand', lat: 23.3700, lng: 85.3250 },
  { name: 'Bhopal Junction', code: 'BPL', city: 'Bhopal', state: 'Madhya Pradesh', lat: 23.2680, lng: 77.4030 },

  // ── West ──
  { name: 'Ahmedabad Junction', code: 'ADI', city: 'Ahmedabad', state: 'Gujarat', lat: 23.0270, lng: 72.6010, aliases: ['Kalupur'] },
  { name: 'Pune Junction', code: 'PUNE', city: 'Pune', state: 'Maharashtra', lat: 18.5285, lng: 73.8743 },
  { name: 'Nagpur Junction', code: 'NGP', city: 'Nagpur', state: 'Maharashtra', lat: 21.1530, lng: 79.0890 },

  // ── Pilgrim / hill gateways ──
  { name: 'Haridwar Junction', code: 'HW', city: 'Haridwar', state: 'Uttarakhand', lat: 29.9540, lng: 78.1700 },
  { name: 'Dehradun', code: 'DDN', city: 'Dehradun', state: 'Uttarakhand', lat: 30.3170, lng: 78.0290 },
  { name: 'Amritsar Junction', code: 'ASR', city: 'Amritsar', state: 'Punjab', lat: 31.6390, lng: 74.8770 },
  { name: 'Visakhapatnam Junction', code: 'VSKP', city: 'Visakhapatnam', state: 'Andhra Pradesh', lat: 17.7170, lng: 83.3030 },
  { name: 'Tirupati', code: 'TPTY', city: 'Tirupati', state: 'Andhra Pradesh', lat: 13.6360, lng: 79.4180 },
]

function norm(s: string): string {
  return s.toLowerCase().trim()
}

/** Search by station name, code, city, state, or alias. */
export function searchRailwayStations(query: string, limit = 8): IndiaRailwayStation[] {
  const q = norm(query)
  if (q.length < 1) return []
  const scored: { s: IndiaRailwayStation; score: number }[] = []
  for (const s of INDIA_RAILWAY_STATIONS) {
    const name = norm(s.name)
    const code = norm(s.code)
    const city = norm(s.city)
    const state = norm(s.state)
    const aliases = (s.aliases ?? []).map(norm)
    let score = -1
    if (code === q) score = 100
    else if (name === q) score = 95
    else if (code.startsWith(q)) score = 85
    else if (name.startsWith(q)) score = 80
    else if (city.startsWith(q)) score = 60
    else if (aliases.some((a) => a === q || a.startsWith(q))) score = 55
    else if (name.includes(q) || city.includes(q)) score = 40
    else if (aliases.some((a) => a.includes(q))) score = 35
    else if (state.includes(q)) score = 20
    if (score >= 0) scored.push({ s, score })
  }
  return scored
    .sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name))
    .slice(0, limit)
    .map((x) => x.s)
}
