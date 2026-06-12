/**
 * City loading themes — drives the personalised "generating" screen.
 *
 * Each theme provides a gradient, a few Font Awesome motif icons, rotating
 * (slightly cheeky) loading lines, and a couple of destination facts/questions.
 * Lookup falls back gracefully: exact city → state → region → generic. This is
 * cosmetic copy only; it never fabricates trip/booking data.
 */

export interface CityTheme {
  /** Display key for the place, e.g. "Gangtok". */
  name: string
  /** Background gradient token name (matches --grad-*). */
  gradient: 'brand' | 'aurora' | 'sunset' | 'mint' | 'candy'
  /** Font Awesome icon names (without the fa- prefix) used as floating motifs. */
  motifs: string[]
  /** Rotating loading microcopy. */
  lines: string[]
  /** Destination facts / travel questions shown beneath the loader. */
  facts: string[]
}

const GENERIC: CityTheme = {
  name: 'your trip',
  gradient: 'aurora',
  motifs: ['plane-departure', 'map-location-dot', 'route', 'camera-retro', 'utensils'],
  lines: [
    'Reading your brief…',
    'Scouting the best stops…',
    'Plotting the smartest route…',
    'Pricing stays and transport…',
    'Plotting your route before your relatives add five more stops…',
    'Packing your itinerary…',
  ],
  facts: [
    'Tip: mornings are usually the calmest time to sightsee.',
    'Did you know? Local food stops often beat the famous ones.',
  ],
}

/** Region themes keyed by a coarse region label inferred from the state. */
const REGION_THEMES: Record<string, CityTheme> = {
  himalaya: {
    name: 'the hills', gradient: 'mint',
    motifs: ['mountain-sun', 'cloud', 'mug-hot', 'tree', 'snowflake'],
    lines: [
      'Convincing the hills to reveal their best views…',
      'Checking if the momos are worth the detour…',
      'Waiting for the clouds to clear the peaks…',
      'Finding the warmest cup of tea on the ridge…',
      'Plotting your route before your relatives add five more stops…',
    ],
    facts: [
      'Pack a light jacket — hill evenings get cool fast.',
      'Sunrise points fill up early; we kept your mornings gentle.',
    ],
  },
  desert: {
    name: 'the desert', gradient: 'sunset',
    motifs: ['chess-rook', 'sun', 'khanda', 'gem', 'camera-retro'],
    lines: [
      'Polishing the palace domes for golden hour…',
      'Asking the forts which sunset point is best…',
      'Finding the lassi everyone keeps talking about…',
      'Negotiating with the bazaar for the good prices…',
    ],
    facts: [
      'Forts glow best around sunset — we timed your visits.',
      'Carry water; afternoons in the desert run hot.',
    ],
  },
  coastal: {
    name: 'the coast', gradient: 'sunset',
    motifs: ['umbrella-beach', 'sun', 'fish', 'sailboat', 'martini-glass-citrus'],
    lines: [
      'Finding the beach shack everyone pretends is secret…',
      'Checking which sunset point has the fewest crowds…',
      'Asking the waves what time low tide is…',
      'Reserving you a sea-facing table (in spirit)…',
    ],
    facts: [
      'Sunset beaches get busy — we picked quieter stretches.',
      'Fresh seafood is best where the boats come in.',
    ],
  },
  temple: {
    name: 'the old city', gradient: 'candy',
    motifs: ['place-of-worship', 'fire', 'water', 'bell', 'om'],
    lines: [
      'Asking the ghats what time sunrise really starts…',
      'Lighting a diya for a smooth journey…',
      'Finding the lanes the guidebooks skip…',
      'Making sure the sweets make it onto the list…',
    ],
    facts: [
      'Sunrise on the river is the highlight — set an early alarm.',
      'Dress modestly for temple visits; mornings are cooler.',
    ],
  },
  metro: {
    name: 'the city', gradient: 'aurora',
    motifs: ['city', 'train-subway', 'mug-saucer', 'utensils', 'building'],
    lines: [
      'Reading your brief…',
      'Finding the cafés worth the queue…',
      'Plotting the smartest route across town…',
      'Adding a sweet stop before the receipt is printed…',
    ],
    facts: [
      'City traffic peaks midday — we spaced your stops out.',
      'Street food and old quarters reward a slow wander.',
    ],
  },
}

/** State → region mapping for the fallback chain. */
const STATE_REGION: Record<string, keyof typeof REGION_THEMES> = {
  'Sikkim': 'himalaya',
  'Himachal Pradesh': 'himalaya',
  'Uttarakhand': 'himalaya',
  'Jammu and Kashmir': 'himalaya',
  'Ladakh': 'himalaya',
  'Arunachal Pradesh': 'himalaya',
  'Rajasthan': 'desert',
  'Goa': 'coastal',
  'Kerala': 'coastal',
  'Andaman and Nicobar Islands': 'coastal',
  'Uttar Pradesh': 'temple',
  'Bihar': 'temple',
  'Odisha': 'temple',
  'Delhi': 'metro',
  'Maharashtra': 'metro',
  'Karnataka': 'metro',
  'Telangana': 'metro',
  'Tamil Nadu': 'metro',
  'West Bengal': 'metro',
}

/** Exact-city themes (override region). Keyed lowercase. */
const CITY_THEMES: Record<string, CityTheme> = {
  gangtok: {
    name: 'Gangtok', gradient: 'mint',
    motifs: ['mountain-sun', 'place-of-worship', 'cloud', 'bowl-food', 'flag'],
    lines: [
      "Convincing Gangtok's hills to reveal their best views…",
      'Checking if the momos are worth the detour…',
      'Counting prayer flags on the way to the monastery…',
      'Waiting for the clouds to clear Kanchenjunga…',
    ],
    facts: [
      'On a clear morning you can see Kanchenjunga from the city itself.',
      'Tsomgo Lake needs a permit — worth planning a day ahead.',
    ],
  },
  varanasi: {
    name: 'Varanasi', gradient: 'candy',
    motifs: ['place-of-worship', 'fire', 'water', 'bell', 'sun'],
    lines: [
      "Asking Varanasi's ghats what time sunrise really starts…",
      'Lighting a diya for the evening aarti…',
      'Finding the lanes that lead to the best kachori…',
      'Booking a quiet boat before the river wakes up…',
    ],
    facts: [
      'The dawn boat ride along the ghats is the classic Varanasi moment.',
      'Ganga aarti at Dashashwamedh Ghat is best seen just after sunset.',
    ],
  },
  jaipur: {
    name: 'Jaipur', gradient: 'sunset',
    motifs: ['chess-rook', 'gem', 'sun', 'camera-retro', 'crown'],
    lines: [
      "Polishing the Pink City's domes for golden hour…",
      'Asking Amber Fort which viewpoint wins at sunset…',
      'Finding the best pyaaz kachori in the old bazaar…',
      'Negotiating block-print prices on your behalf…',
    ],
    facts: [
      'Nahargarh Fort has the best sunset view over the Pink City.',
      'Hawa Mahal glows warmest in the early morning light.',
    ],
  },
  udaipur: {
    name: 'Udaipur', gradient: 'sunset',
    motifs: ['water', 'chess-rook', 'sailboat', 'crown', 'sun'],
    lines: [
      'Asking the lakes for their calmest reflection…',
      'Finding the rooftop with the best palace view…',
      'Timing a boat ride for golden hour…',
    ],
    facts: [
      'Sunset over Lake Pichola is Udaipur at its most magical.',
      'The City Palace looks its best lit up after dark.',
    ],
  },
  jodhpur: {
    name: 'Jodhpur', gradient: 'sunset',
    motifs: ['chess-rook', 'sun', 'gem', 'camera-retro', 'crown'],
    lines: [
      'Climbing up to Mehrangarh for the blue-city view…',
      'Counting the blue houses below the fort…',
      'Finding the best makhaniya lassi in town…',
    ],
    facts: [
      'Mehrangarh Fort towers 120m over the blue old town.',
      'The blue houses are most photogenic in the morning light.',
    ],
  },
  goa: {
    name: 'Goa', gradient: 'sunset',
    motifs: ['umbrella-beach', 'sun', 'fish', 'motorcycle', 'martini-glass-citrus'],
    lines: [
      'Finding the Goa shack everyone pretends is secret…',
      'Checking which beach has the calmest sunset crowd…',
      'Renting a scooter for the coastal road (in spirit)…',
      'Reserving a sea-facing table for golden hour…',
    ],
    facts: [
      'North Goa is buzzy; South Goa is quieter and slower.',
      'Sunsets at Vagator and Palolem are local favourites.',
    ],
  },
  darjeeling: {
    name: 'Darjeeling', gradient: 'mint',
    motifs: ['mug-hot', 'train', 'mountain-sun', 'cloud', 'leaf'],
    lines: [
      'Brewing the first flush before the toy train leaves…',
      'Waiting for the mist to lift off the tea gardens…',
      'Asking Tiger Hill what time sunrise really is…',
    ],
    facts: [
      'Tiger Hill sunrise over Kanchenjunga is the classic outing.',
      'The Darjeeling Himalayan Railway is a UNESCO heritage line.',
    ],
  },
  kolkata: {
    name: 'Kolkata', gradient: 'aurora',
    motifs: ['train-tram', 'building-columns', 'mug-saucer', 'utensils', 'taxi'],
    lines: [
      'Making sure Kolkata adds mishti before the receipt is printed…',
      'Flagging a yellow taxi to Howrah Bridge…',
      'Finding the best kathi roll in the lanes…',
      'Asking the trams to wait one more minute…',
    ],
    facts: [
      'Victoria Memorial looks grandest in the late-afternoon light.',
      'A puchka and mishti doi crawl is a Kolkata rite of passage.',
    ],
  },
  agra: {
    name: 'Agra', gradient: 'candy',
    motifs: ['gopuram', 'sun', 'camera-retro', 'gem', 'moon'],
    lines: [
      'Polishing the marble for a perfect Taj sunrise…',
      'Beating the crowds to the Taj at first light…',
      'Finding the quiet bench with the best symmetry…',
    ],
    facts: [
      'The Taj Mahal changes hue from pink at dawn to gold at dusk.',
      'Mehtab Bagh across the river offers a crowd-free Taj view.',
    ],
  },
  munnar: {
    name: 'Munnar', gradient: 'mint',
    motifs: ['leaf', 'mountain-sun', 'cloud', 'mug-hot', 'tree'],
    lines: [
      'Wandering through endless tea hills…',
      'Waiting for the mist to roll over the slopes…',
      'Finding the viewpoint with the greenest carpet…',
    ],
    facts: [
      'Munnar sits among some of the highest tea estates in the world.',
      'Mornings are misty and magical across the plantations.',
    ],
  },
  kochi: {
    name: 'Kochi', gradient: 'brand',
    motifs: ['sailboat', 'fish', 'umbrella-beach', 'water', 'sun'],
    lines: [
      'Watching the Chinese fishing nets dip at sunset…',
      'Finding the freshest catch by the harbour…',
      'Booking a slow backwater hour for you…',
    ],
    facts: [
      'Fort Kochi blends Portuguese, Dutch and local heritage.',
      'The waterfront fishing nets are best at sunset.',
    ],
  },
  puri: {
    name: 'Puri', gradient: 'candy',
    motifs: ['place-of-worship', 'umbrella-beach', 'flag', 'sun', 'water'],
    lines: [
      'Catching sunrise on Puri beach…',
      'Joining the queue for mahaprasad…',
      'Finding the best khaja before the train…',
    ],
    facts: [
      'The Jagannath Temple is one of the Char Dham pilgrimage sites.',
      'Puri beach sunrises draw crowds well before dawn.',
    ],
  },
}

/**
 * Resolve a loading theme for a destination, falling back city → state →
 * region → generic. `name` is set to the best available place label.
 */
export function getCityTheme(city?: string | null, state?: string | null): CityTheme {
  const key = (city ?? '').trim().toLowerCase()
  if (key && CITY_THEMES[key]) return CITY_THEMES[key]

  // Try the first word of the city (handles "Gangtok, Sikkim" style strings).
  const firstWord = key.split(/[,\s]/)[0]
  if (firstWord && CITY_THEMES[firstWord]) return CITY_THEMES[firstWord]

  const region = state ? STATE_REGION[state.trim()] : undefined
  if (region) {
    const base = REGION_THEMES[region]
    return { ...base, name: (city ?? base.name) || base.name }
  }

  return { ...GENERIC, name: (city ?? GENERIC.name) || GENERIC.name }
}
