/**
 * India airport seed dataset — Phase 16C.
 *
 * Major airports relevant to tourist/business travel. Not exhaustive; the shape
 * is designed so a fuller dataset can be swapped in later without UI changes.
 * Used as geographic context now; wired into transport budget in Phase 16H.
 */

export type AirportType = 'international' | 'domestic' | 'civil_enclave'

export interface IndiaAirport {
  name: string
  iataCode: string
  city: string
  state: string
  lat?: number
  lng?: number
  type?: AirportType
  aliases?: string[]
}

export const INDIA_AIRPORTS: IndiaAirport[] = [
  // ── East / North-East ──
  { name: 'Netaji Subhas Chandra Bose International Airport', iataCode: 'CCU', city: 'Kolkata', state: 'West Bengal', lat: 22.6547, lng: 88.4467, type: 'international', aliases: ['Dum Dum'] },
  { name: 'Bagdogra Airport', iataCode: 'IXB', city: 'Siliguri', state: 'West Bengal', lat: 26.6812, lng: 88.3286, type: 'civil_enclave', aliases: ['Bagdogra'] },
  { name: 'Pakyong Greenfield Airport', iataCode: 'PYG', city: 'Gangtok', state: 'Sikkim', lat: 27.2257, lng: 88.5867, type: 'domestic', aliases: ['Pakyong'] },
  { name: 'Biju Patnaik International Airport', iataCode: 'BBI', city: 'Bhubaneswar', state: 'Odisha', lat: 20.2444, lng: 85.8178, type: 'international' },
  { name: 'Lokpriya Gopinath Bordoloi International Airport', iataCode: 'GAU', city: 'Guwahati', state: 'Assam', lat: 26.1061, lng: 91.5859, type: 'international', aliases: ['Borjhar'] },

  // ── Delhi / North ──
  { name: 'Indira Gandhi International Airport', iataCode: 'DEL', city: 'New Delhi', state: 'Delhi', lat: 28.5562, lng: 77.1000, type: 'international' },
  { name: 'Sri Guru Ram Dass Jee International Airport', iataCode: 'ATQ', city: 'Amritsar', state: 'Punjab', lat: 31.7096, lng: 74.7973, type: 'international', aliases: ['Raja Sansi'] },
  { name: 'Dehradun Airport', iataCode: 'DED', city: 'Dehradun', state: 'Uttarakhand', lat: 30.1897, lng: 78.1803, type: 'domestic', aliases: ['Jolly Grant'] },
  { name: 'Sheikh ul-Alam International Airport', iataCode: 'SXR', city: 'Srinagar', state: 'Jammu and Kashmir', lat: 33.9871, lng: 74.7742, type: 'international' },
  { name: 'Kushok Bakula Rimpochee Airport', iataCode: 'IXL', city: 'Leh', state: 'Ladakh', lat: 34.1359, lng: 77.5465, type: 'domestic' },

  // ── West ──
  { name: 'Chhatrapati Shivaji Maharaj International Airport', iataCode: 'BOM', city: 'Mumbai', state: 'Maharashtra', lat: 19.0896, lng: 72.8656, type: 'international' },
  { name: 'Pune Airport', iataCode: 'PNQ', city: 'Pune', state: 'Maharashtra', lat: 18.5793, lng: 73.9089, type: 'domestic', aliases: ['Lohegaon'] },
  { name: 'Goa International Airport', iataCode: 'GOI', city: 'Panaji', state: 'Goa', lat: 15.3808, lng: 73.8314, type: 'international', aliases: ['Dabolim', 'Goa'] },
  { name: 'Manohar International Airport', iataCode: 'GOX', city: 'Panaji', state: 'Goa', lat: 15.7430, lng: 73.8580, type: 'international', aliases: ['Mopa', 'North Goa'] },
  { name: 'Sardar Vallabhbai Patel International Airport', iataCode: 'AMD', city: 'Ahmedabad', state: 'Gujarat', lat: 23.0772, lng: 72.6347, type: 'international' },

  // ── Rajasthan ──
  { name: 'Jaipur International Airport', iataCode: 'JAI', city: 'Jaipur', state: 'Rajasthan', lat: 26.8242, lng: 75.8122, type: 'international', aliases: ['Sanganer'] },
  { name: 'Maharana Pratap Airport', iataCode: 'UDR', city: 'Udaipur', state: 'Rajasthan', lat: 24.6177, lng: 73.8961, type: 'domestic', aliases: ['Dabok'] },
  { name: 'Jodhpur Airport', iataCode: 'JDH', city: 'Jodhpur', state: 'Rajasthan', lat: 26.2511, lng: 73.0489, type: 'civil_enclave' },

  // ── North / Central ──
  { name: 'Lal Bahadur Shastri International Airport', iataCode: 'VNS', city: 'Varanasi', state: 'Uttar Pradesh', lat: 25.4524, lng: 82.8593, type: 'international', aliases: ['Babatpur'] },
  { name: 'Chaudhary Charan Singh International Airport', iataCode: 'LKO', city: 'Lucknow', state: 'Uttar Pradesh', lat: 26.7606, lng: 80.8893, type: 'international', aliases: ['Amausi'] },
  { name: 'Jay Prakash Narayan Airport', iataCode: 'PAT', city: 'Patna', state: 'Bihar', lat: 25.5913, lng: 85.0880, type: 'domestic' },
  { name: 'Gaya Airport', iataCode: 'GAY', city: 'Gaya', state: 'Bihar', lat: 24.7444, lng: 84.9512, type: 'international', aliases: ['Bodh Gaya'] },
  { name: 'Birsa Munda Airport', iataCode: 'IXR', city: 'Ranchi', state: 'Jharkhand', lat: 23.3143, lng: 85.3217, type: 'domestic' },
  { name: 'Raja Bhoj Airport', iataCode: 'BHO', city: 'Bhopal', state: 'Madhya Pradesh', lat: 23.2875, lng: 77.3374, type: 'domestic' },
  { name: 'Dr. Babasaheb Ambedkar International Airport', iataCode: 'NAG', city: 'Nagpur', state: 'Maharashtra', lat: 21.0922, lng: 79.0472, type: 'international', aliases: ['Sonegaon'] },

  // ── South ──
  { name: 'Kempegowda International Airport', iataCode: 'BLR', city: 'Bengaluru', state: 'Karnataka', lat: 13.1986, lng: 77.7066, type: 'international' },
  { name: 'Chennai International Airport', iataCode: 'MAA', city: 'Chennai', state: 'Tamil Nadu', lat: 12.9941, lng: 80.1709, type: 'international', aliases: ['Meenambakkam'] },
  { name: 'Rajiv Gandhi International Airport', iataCode: 'HYD', city: 'Hyderabad', state: 'Telangana', lat: 17.2403, lng: 78.4294, type: 'international', aliases: ['Shamshabad'] },
  { name: 'Cochin International Airport', iataCode: 'COK', city: 'Kochi', state: 'Kerala', lat: 10.1520, lng: 76.4019, type: 'international', aliases: ['Nedumbassery'] },
  { name: 'Trivandrum International Airport', iataCode: 'TRV', city: 'Thiruvananthapuram', state: 'Kerala', lat: 8.4821, lng: 76.9201, type: 'international' },
  { name: 'Visakhapatnam Airport', iataCode: 'VTZ', city: 'Visakhapatnam', state: 'Andhra Pradesh', lat: 17.7211, lng: 83.2245, type: 'international' },
  { name: 'Tirupati Airport', iataCode: 'TIR', city: 'Tirupati', state: 'Andhra Pradesh', lat: 13.6325, lng: 79.5433, type: 'domestic', aliases: ['Renigunta'] },
  { name: 'Madurai Airport', iataCode: 'IXM', city: 'Madurai', state: 'Tamil Nadu', lat: 9.8345, lng: 78.0934, type: 'domestic' },
  { name: 'Coimbatore International Airport', iataCode: 'CJB', city: 'Coimbatore', state: 'Tamil Nadu', lat: 11.0300, lng: 77.0434, type: 'international' },
]

function norm(s: string): string {
  return s.toLowerCase().trim()
}

/** Search by airport name, IATA code, city, state, or alias. */
export function searchAirports(query: string, limit = 8): IndiaAirport[] {
  const q = norm(query)
  if (q.length < 1) return []
  const scored: { a: IndiaAirport; score: number }[] = []
  for (const a of INDIA_AIRPORTS) {
    const name = norm(a.name)
    const code = norm(a.iataCode)
    const city = norm(a.city)
    const state = norm(a.state)
    const aliases = (a.aliases ?? []).map(norm)
    let score = -1
    if (code === q) score = 100
    else if (name === q) score = 95
    else if (code.startsWith(q)) score = 85
    else if (city.startsWith(q)) score = 75
    else if (name.startsWith(q)) score = 70
    else if (aliases.some((al) => al === q || al.startsWith(q))) score = 60
    else if (name.includes(q) || city.includes(q)) score = 40
    else if (aliases.some((al) => al.includes(q))) score = 35
    else if (state.includes(q)) score = 20
    if (score >= 0) scored.push({ a, score })
  }
  return scored
    .sort((x, y) => y.score - x.score || x.a.name.localeCompare(y.a.name))
    .slice(0, limit)
    .map((s) => s.a)
}
