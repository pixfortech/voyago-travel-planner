/**
 * Indian Railways — station master dataset.
 *
 * A curated, source-backed (public IRCTC / Indian Railways / Konkan Railway
 * knowledge) station master. NOT the full ~8000-station national list — that
 * would bloat the client bundle — but a broad, correct national spread with
 * FULL Goa / Konkan corridor coverage, designed so a fuller dataset can be
 * dropped in later (see `src/lib/trains/timetableImport.ts`) without UI change.
 *
 * Correctness priority: station CODE is the critical field (used for route
 * matching + AI context); names/aliases/city/state are next; lat/lng is
 * optional (only stations WITH coordinates take part in nearest-station search).
 *
 * This file is intentionally import-free (pure data) so it can be loaded from
 * the client, the server, or a standalone Node smoke test with no aliases.
 */

export interface RailwayStation {
  /** IRCTC station code, uppercase (e.g. "MAO", "VSG", "NDLS"). */
  code: string
  /** Canonical station name (e.g. "Madgaon Junction"). */
  name: string
  /** Primary city / locality the station serves. */
  city: string
  /** State / UT. */
  state: string
  /** District, where known (helps disambiguate same-name towns). */
  district?: string
  /** Indian Railways zone code, where known (e.g. "KR", "SWR", "CR"). */
  zone?: string
  /** Latitude (decimal degrees). Optional — required only for nearest-station. */
  lat?: number
  /** Longitude (decimal degrees). */
  lng?: number
  /** Alternate names / common spellings / old names searched alongside `name`. */
  aliases?: string[]
  /** Extra free-text keywords (nearby tourist areas the station serves). */
  keywords?: string[]
  /** True for big junctions / terminals / state-capital stations. */
  major?: boolean
}

export const RAILWAY_STATIONS: RailwayStation[] = [
  // ════════════════════════════════════════════════════════════════════════
  // GOA — Konkan Railway (KR) + South Western Railway (SWR). Full coverage.
  // ════════════════════════════════════════════════════════════════════════
  { code: 'MAO', name: 'Madgaon Junction', city: 'Madgaon', district: 'South Goa', state: 'Goa', zone: 'KR', lat: 15.2832, lng: 73.9862, major: true, aliases: ['Margao', 'Margaon', 'Madgaon Jn', 'Madgao'], keywords: ['Colva', 'Benaulim', 'South Goa'] },
  { code: 'VSG', name: 'Vasco Da Gama', city: 'Vasco da Gama', district: 'South Goa', state: 'Goa', zone: 'SWR', lat: 15.4036, lng: 73.8156, major: true, aliases: ['Vasco', 'Vasco-da-Gama', 'Vasco Da Gama'], keywords: ['Mormugao', 'Bogmalo', 'Dabolim airport'] },
  { code: 'KRMI', name: 'Karmali', city: 'Karmali', district: 'North Goa', state: 'Goa', zone: 'KR', lat: 15.5083, lng: 73.9486, aliases: ['Karmali (Old Goa)', 'Carambolim'], keywords: ['Panaji', 'Panjim', 'Old Goa'] },
  { code: 'THVM', name: 'Thivim', city: 'Thivim', district: 'North Goa', state: 'Goa', zone: 'KR', lat: 15.6175, lng: 73.7561, aliases: ['Tivim'], keywords: ['Mapusa', 'Calangute', 'Baga', 'Anjuna', 'Candolim', 'North Goa beaches'] },
  { code: 'PERN', name: 'Pernem', city: 'Pernem', district: 'North Goa', state: 'Goa', zone: 'KR', lat: 15.7197, lng: 73.7972, aliases: ['Pednem'], keywords: ['Arambol', 'Morjim', 'Mandrem', 'Ashvem'] },
  { code: 'CNO', name: 'Canacona', city: 'Canacona', district: 'South Goa', state: 'Goa', zone: 'KR', lat: 14.9939, lng: 74.0561, aliases: ['Chaudi', 'Cancona'], keywords: ['Palolem', 'Agonda', 'Patnem'] },
  { code: 'QLM', name: 'Kulem', city: 'Kulem', district: 'South Goa', state: 'Goa', zone: 'SWR', lat: 15.3622, lng: 74.2483, aliases: ['Collem', 'Kalem', 'Caulem'], keywords: ['Dudhsagar Falls', 'Bhagwan Mahaveer sanctuary'] },
  { code: 'SVM', name: 'Sanvordem Church', city: 'Sanvordem', district: 'South Goa', state: 'Goa', zone: 'SWR', lat: 15.2725, lng: 74.1561, aliases: ['Sanverdam Church', 'Sanvordem'] },
  { code: 'BLLI', name: 'Balli', city: 'Balli', district: 'South Goa', state: 'Goa', zone: 'KR', lat: 15.0986, lng: 74.0339, aliases: ['Bali'], keywords: ['Quepem'] },

  // ════════════════════════════════════════════════════════════════════════
  // KONKAN corridor — Maharashtra & coastal Karnataka (zone KR / SR).
  // Makes Goa nearest-station + route context realistic up & down the coast.
  // ════════════════════════════════════════════════════════════════════════
  { code: 'PNVL', name: 'Panvel Junction', city: 'Panvel', district: 'Raigad', state: 'Maharashtra', zone: 'CR', lat: 18.9894, lng: 73.1206, major: true, keywords: ['Navi Mumbai'] },
  { code: 'ROHA', name: 'Roha', city: 'Roha', district: 'Raigad', state: 'Maharashtra', zone: 'KR', lat: 18.4361, lng: 73.1192 },
  { code: 'KHED', name: 'Khed', city: 'Khed', district: 'Ratnagiri', state: 'Maharashtra', zone: 'KR', lat: 17.7186, lng: 73.3950 },
  { code: 'CHI', name: 'Chiplun', city: 'Chiplun', district: 'Ratnagiri', state: 'Maharashtra', zone: 'KR', lat: 17.5300, lng: 73.5200 },
  { code: 'RN', name: 'Ratnagiri', city: 'Ratnagiri', district: 'Ratnagiri', state: 'Maharashtra', zone: 'KR', lat: 16.9939, lng: 73.5900, major: true, keywords: ['Ganpatipule'] },
  { code: 'KKW', name: 'Kankavali', city: 'Kankavali', district: 'Sindhudurg', state: 'Maharashtra', zone: 'KR', lat: 16.2667, lng: 73.7100 },
  { code: 'SNDD', name: 'Sindhudurg', city: 'Sindhudurg', district: 'Sindhudurg', state: 'Maharashtra', zone: 'KR', lat: 16.1561, lng: 73.6692, keywords: ['Malvan', 'Tarkarli'] },
  { code: 'KUDL', name: 'Kudal', city: 'Kudal', district: 'Sindhudurg', state: 'Maharashtra', zone: 'KR', lat: 16.0072, lng: 73.6850 },
  { code: 'SWV', name: 'Sawantwadi Road', city: 'Sawantwadi', district: 'Sindhudurg', state: 'Maharashtra', zone: 'KR', lat: 15.9436, lng: 73.7464, keywords: ['Amboli', 'Vengurla'] },
  { code: 'KAWR', name: 'Karwar', city: 'Karwar', district: 'Uttara Kannada', state: 'Karnataka', zone: 'KR', lat: 14.8083, lng: 74.1300, keywords: ['Devbagh', 'Tilmati beach'] },
  { code: 'GOK', name: 'Gokarna Road', city: 'Gokarna', district: 'Uttara Kannada', state: 'Karnataka', zone: 'KR', lat: 14.5167, lng: 74.3400, keywords: ['Om beach', 'Kudle beach'] },
  { code: 'KT', name: 'Kumta', city: 'Kumta', district: 'Uttara Kannada', state: 'Karnataka', zone: 'KR', lat: 14.4256, lng: 74.4200 },
  { code: 'HNA', name: 'Honnavar', city: 'Honnavar', district: 'Uttara Kannada', state: 'Karnataka', zone: 'KR', lat: 14.2806, lng: 74.4450 },
  { code: 'MRDW', name: 'Murdeshwar', city: 'Murdeshwar', district: 'Uttara Kannada', state: 'Karnataka', zone: 'KR', lat: 14.0939, lng: 74.4892, keywords: ['Murudeshwar temple'] },
  { code: 'BTJL', name: 'Bhatkal', city: 'Bhatkal', district: 'Uttara Kannada', state: 'Karnataka', zone: 'KR', lat: 13.9856, lng: 74.5550 },
  { code: 'BYNR', name: 'Mookambika Road Byndoor', city: 'Byndoor', district: 'Udupi', state: 'Karnataka', zone: 'KR', lat: 13.8633, lng: 74.6361, aliases: ['Byndoor'] },
  { code: 'KUDA', name: 'Kundapura', city: 'Kundapura', district: 'Udupi', state: 'Karnataka', zone: 'KR', lat: 13.6256, lng: 74.6892, aliases: ['Coondapoor'] },
  { code: 'UD', name: 'Udupi', city: 'Udupi', district: 'Udupi', state: 'Karnataka', zone: 'KR', lat: 13.3433, lng: 74.7456, keywords: ['Malpe beach', 'St Marys Island'] },
  { code: 'MAJN', name: 'Mangaluru Junction', city: 'Mangaluru', district: 'Dakshina Kannada', state: 'Karnataka', zone: 'SR', lat: 12.8703, lng: 74.8431, major: true, aliases: ['Mangalore Junction', 'Kankanady'] },
  { code: 'MAQ', name: 'Mangaluru Central', city: 'Mangaluru', district: 'Dakshina Kannada', state: 'Karnataka', zone: 'SR', lat: 12.8650, lng: 74.8400, major: true, aliases: ['Mangalore Central'] },

  // ════════════════════════════════════════════════════════════════════════
  // WEST BENGAL / North Bengal
  // ════════════════════════════════════════════════════════════════════════
  { code: 'HWH', name: 'Howrah Junction', city: 'Kolkata', state: 'West Bengal', zone: 'ER', lat: 22.5839, lng: 88.3425, major: true },
  { code: 'SDAH', name: 'Sealdah', city: 'Kolkata', state: 'West Bengal', zone: 'ER', lat: 22.5675, lng: 88.3700, major: true },
  { code: 'KOAA', name: 'Kolkata', city: 'Kolkata', state: 'West Bengal', zone: 'ER', lat: 22.5980, lng: 88.3700, aliases: ['Chitpur'], major: true },
  { code: 'SHM', name: 'Shalimar', city: 'Howrah', state: 'West Bengal', zone: 'SER', lat: 22.5550, lng: 88.3150 },
  { code: 'KGP', name: 'Kharagpur Junction', city: 'Kharagpur', district: 'Paschim Medinipur', state: 'West Bengal', zone: 'SER', lat: 22.3390, lng: 87.3250, major: true },
  { code: 'BWN', name: 'Barddhaman Junction', city: 'Bardhaman', state: 'West Bengal', zone: 'ER', lat: 23.2400, lng: 87.8550, aliases: ['Burdwan'] },
  { code: 'RPH', name: 'Rampurhat Junction', city: 'Rampurhat', district: 'Birbhum', state: 'West Bengal', zone: 'ER', lat: 24.1770, lng: 87.7830 },
  { code: 'BHP', name: 'Bolpur Shantiniketan', city: 'Bolpur', district: 'Birbhum', state: 'West Bengal', zone: 'ER', lat: 23.6650, lng: 87.6920, keywords: ['Santiniketan', 'Visva-Bharati'] },
  { code: 'NJP', name: 'New Jalpaiguri', city: 'Siliguri', state: 'West Bengal', zone: 'NFR', lat: 26.6855, lng: 88.3920, aliases: ['NJP', 'Siliguri'], keywords: ['Darjeeling', 'Gangtok', 'Dooars'], major: true },
  { code: 'SGUJ', name: 'Siliguri Junction', city: 'Siliguri', state: 'West Bengal', zone: 'NFR', lat: 26.7150, lng: 88.4250 },
  { code: 'ASN', name: 'Asansol Junction', city: 'Asansol', state: 'West Bengal', zone: 'ER', lat: 23.6850, lng: 86.9760, major: true },
  { code: 'DGR', name: 'Durgapur', city: 'Durgapur', state: 'West Bengal', zone: 'ER', lat: 23.5300, lng: 87.2920 },
  { code: 'MLDT', name: 'Malda Town', city: 'Malda', state: 'West Bengal', zone: 'ER', lat: 25.0090, lng: 88.1440 },

  // ════════════════════════════════════════════════════════════════════════
  // DELHI / NCR
  // ════════════════════════════════════════════════════════════════════════
  { code: 'NDLS', name: 'New Delhi', city: 'New Delhi', state: 'Delhi', zone: 'NR', lat: 28.6430, lng: 77.2190, major: true },
  { code: 'DLI', name: 'Delhi Junction', city: 'Delhi', state: 'Delhi', zone: 'NR', lat: 28.6610, lng: 77.2270, aliases: ['Old Delhi'], major: true },
  { code: 'NZM', name: 'Hazrat Nizamuddin', city: 'New Delhi', state: 'Delhi', zone: 'NR', lat: 28.5880, lng: 77.2510, major: true },
  { code: 'ANVT', name: 'Anand Vihar Terminal', city: 'Delhi', state: 'Delhi', zone: 'NR', lat: 28.6490, lng: 77.3160, major: true },
  { code: 'DEE', name: 'Delhi Sarai Rohilla', city: 'Delhi', state: 'Delhi', zone: 'NR', lat: 28.6640, lng: 77.1880 },
  { code: 'GZB', name: 'Ghaziabad Junction', city: 'Ghaziabad', state: 'Uttar Pradesh', zone: 'NR', lat: 28.6510, lng: 77.4380 },

  // ════════════════════════════════════════════════════════════════════════
  // PUNJAB / HARYANA / CHANDIGARH / HIMACHAL
  // ════════════════════════════════════════════════════════════════════════
  { code: 'ASR', name: 'Amritsar Junction', city: 'Amritsar', state: 'Punjab', zone: 'NR', lat: 31.6390, lng: 74.8770, major: true, keywords: ['Golden Temple', 'Wagah'] },
  { code: 'JUC', name: 'Jalandhar City', city: 'Jalandhar', state: 'Punjab', zone: 'NR', lat: 31.2920, lng: 75.5760 },
  { code: 'LDH', name: 'Ludhiana Junction', city: 'Ludhiana', state: 'Punjab', zone: 'NR', lat: 30.9120, lng: 75.8550, major: true },
  { code: 'UMB', name: 'Ambala Cantt Junction', city: 'Ambala', state: 'Haryana', zone: 'NR', lat: 30.3780, lng: 76.7770, major: true },
  { code: 'CDG', name: 'Chandigarh', city: 'Chandigarh', state: 'Chandigarh', zone: 'NR', lat: 30.7050, lng: 76.8030, major: true },
  { code: 'KLK', name: 'Kalka', city: 'Kalka', district: 'Panchkula', state: 'Haryana', zone: 'NR', lat: 30.8380, lng: 76.9420, keywords: ['Shimla toy train'] },
  { code: 'BTI', name: 'Bathinda Junction', city: 'Bathinda', state: 'Punjab', zone: 'NR', lat: 30.2110, lng: 74.9460 },
  { code: 'SML', name: 'Shimla', city: 'Shimla', state: 'Himachal Pradesh', zone: 'NR', lat: 31.1040, lng: 77.1700, keywords: ['Mall Road'] },
  { code: 'JAT', name: 'Jammu Tawi', city: 'Jammu', state: 'Jammu and Kashmir', zone: 'NR', lat: 32.7080, lng: 74.8530, major: true, keywords: ['Vaishno Devi', 'Srinagar gateway'] },
  { code: 'SVDK', name: 'Shri Mata Vaishno Devi Katra', city: 'Katra', district: 'Reasi', state: 'Jammu and Kashmir', zone: 'NR', lat: 32.9920, lng: 74.9490, aliases: ['Katra'], keywords: ['Vaishno Devi'] },

  // ════════════════════════════════════════════════════════════════════════
  // UTTAR PRADESH
  // ════════════════════════════════════════════════════════════════════════
  { code: 'CNB', name: 'Kanpur Central', city: 'Kanpur', state: 'Uttar Pradesh', zone: 'NCR', lat: 26.4540, lng: 80.3500, major: true },
  { code: 'LKO', name: 'Lucknow Charbagh', city: 'Lucknow', state: 'Uttar Pradesh', zone: 'NR', lat: 26.8310, lng: 80.9210, aliases: ['Charbagh'], major: true },
  { code: 'AGC', name: 'Agra Cantt', city: 'Agra', state: 'Uttar Pradesh', zone: 'NCR', lat: 27.1570, lng: 77.9930, major: true, keywords: ['Taj Mahal'] },
  { code: 'MTJ', name: 'Mathura Junction', city: 'Mathura', state: 'Uttar Pradesh', zone: 'NCR', lat: 27.4830, lng: 77.6770, keywords: ['Vrindavan'] },
  { code: 'BSB', name: 'Varanasi Junction', city: 'Varanasi', state: 'Uttar Pradesh', zone: 'NER', lat: 25.3270, lng: 82.9870, aliases: ['Banaras', 'Kashi', 'Varanasi Cantt'], major: true },
  { code: 'DDU', name: 'Pt Deen Dayal Upadhyaya Junction', city: 'Chandauli', state: 'Uttar Pradesh', zone: 'ECR', lat: 25.2820, lng: 83.1180, aliases: ['Mughalsarai', 'Mugalsarai'], major: true },
  { code: 'PRYJ', name: 'Prayagraj Junction', city: 'Prayagraj', state: 'Uttar Pradesh', zone: 'NCR', lat: 25.4500, lng: 81.8200, aliases: ['Allahabad', 'Allahabad Junction'], major: true, keywords: ['Triveni Sangam', 'Kumbh'] },
  { code: 'GKP', name: 'Gorakhpur Junction', city: 'Gorakhpur', state: 'Uttar Pradesh', zone: 'NER', lat: 26.7600, lng: 83.3700, major: true },
  { code: 'AY', name: 'Ayodhya Junction', city: 'Ayodhya', state: 'Uttar Pradesh', zone: 'NER', lat: 26.7920, lng: 82.1990, aliases: ['Ayodhya Dham'], keywords: ['Ram Mandir'] },
  { code: 'JHS', name: 'Jhansi Junction', city: 'Jhansi', state: 'Uttar Pradesh', zone: 'NCR', lat: 25.4480, lng: 78.5680, major: true, keywords: ['Orchha', 'Khajuraho gateway'] },
  { code: 'MB', name: 'Moradabad Junction', city: 'Moradabad', state: 'Uttar Pradesh', zone: 'NR', lat: 28.8390, lng: 78.7770 },
  { code: 'BE', name: 'Bareilly Junction', city: 'Bareilly', state: 'Uttar Pradesh', zone: 'NR', lat: 28.3560, lng: 79.4100 },

  // ════════════════════════════════════════════════════════════════════════
  // RAJASTHAN
  // ════════════════════════════════════════════════════════════════════════
  { code: 'JP', name: 'Jaipur Junction', city: 'Jaipur', state: 'Rajasthan', zone: 'NWR', lat: 26.9196, lng: 75.7878, major: true, keywords: ['Pink City', 'Amber Fort'] },
  { code: 'AII', name: 'Ajmer Junction', city: 'Ajmer', state: 'Rajasthan', zone: 'NWR', lat: 26.4710, lng: 74.6410, keywords: ['Pushkar', 'Dargah'] },
  { code: 'JU', name: 'Jodhpur Junction', city: 'Jodhpur', state: 'Rajasthan', zone: 'NWR', lat: 26.2960, lng: 73.0290, major: true, keywords: ['Blue City', 'Mehrangarh'] },
  { code: 'UDZ', name: 'Udaipur City', city: 'Udaipur', state: 'Rajasthan', zone: 'NWR', lat: 24.5810, lng: 73.6920, major: true, keywords: ['Lake Pichola', 'City Palace'] },
  { code: 'JSM', name: 'Jaisalmer', city: 'Jaisalmer', state: 'Rajasthan', zone: 'NWR', lat: 26.9080, lng: 70.9170, keywords: ['Golden City', 'Sam dunes', 'Thar'] },
  { code: 'BKN', name: 'Bikaner Junction', city: 'Bikaner', state: 'Rajasthan', zone: 'NWR', lat: 28.0140, lng: 73.3120 },
  { code: 'KOTA', name: 'Kota Junction', city: 'Kota', state: 'Rajasthan', zone: 'WCR', lat: 25.1840, lng: 75.8460, major: true },
  { code: 'SWM', name: 'Sawai Madhopur', city: 'Sawai Madhopur', state: 'Rajasthan', zone: 'WCR', lat: 26.0230, lng: 76.3490, keywords: ['Ranthambore'] },
  { code: 'ABR', name: 'Abu Road', city: 'Abu Road', district: 'Sirohi', state: 'Rajasthan', zone: 'NWR', lat: 24.4810, lng: 72.7820, keywords: ['Mount Abu'] },

  // ════════════════════════════════════════════════════════════════════════
  // GUJARAT
  // ════════════════════════════════════════════════════════════════════════
  { code: 'ADI', name: 'Ahmedabad Junction', city: 'Ahmedabad', state: 'Gujarat', zone: 'WR', lat: 23.0270, lng: 72.6010, aliases: ['Kalupur'], major: true },
  { code: 'BRC', name: 'Vadodara Junction', city: 'Vadodara', state: 'Gujarat', zone: 'WR', lat: 22.3070, lng: 73.1810, aliases: ['Baroda'], major: true },
  { code: 'ST', name: 'Surat', city: 'Surat', state: 'Gujarat', zone: 'WR', lat: 21.2050, lng: 72.8400, major: true },
  { code: 'RJT', name: 'Rajkot Junction', city: 'Rajkot', state: 'Gujarat', zone: 'WR', lat: 22.3030, lng: 70.7980 },
  { code: 'BVC', name: 'Bhavnagar Terminus', city: 'Bhavnagar', state: 'Gujarat', zone: 'WR', lat: 21.7720, lng: 72.1530 },
  { code: 'JAM', name: 'Jamnagar', city: 'Jamnagar', state: 'Gujarat', zone: 'WR', lat: 22.4730, lng: 70.0660 },
  { code: 'BHUJ', name: 'Bhuj', city: 'Bhuj', district: 'Kutch', state: 'Gujarat', zone: 'WR', lat: 23.2530, lng: 69.6690, keywords: ['Rann of Kutch'] },
  { code: 'GIMB', name: 'Gandhidham Junction', city: 'Gandhidham', district: 'Kutch', state: 'Gujarat', zone: 'WR', lat: 23.0750, lng: 70.1330 },
  { code: 'DWK', name: 'Dwarka', city: 'Dwarka', district: 'Devbhumi Dwarka', state: 'Gujarat', zone: 'WR', lat: 22.2370, lng: 68.9680, keywords: ['Dwarkadhish temple'] },
  { code: 'VRL', name: 'Veraval', city: 'Veraval', district: 'Gir Somnath', state: 'Gujarat', zone: 'WR', lat: 20.9100, lng: 70.3670, keywords: ['Somnath', 'Gir'] },

  // ════════════════════════════════════════════════════════════════════════
  // MAHARASHTRA (non-Konkan)
  // ════════════════════════════════════════════════════════════════════════
  { code: 'CSMT', name: 'Chhatrapati Shivaji Maharaj Terminus', city: 'Mumbai', state: 'Maharashtra', zone: 'CR', lat: 18.9398, lng: 72.8355, aliases: ['VT', 'Victoria Terminus', 'Bombay VT', 'CST'], major: true },
  { code: 'LTT', name: 'Lokmanya Tilak Terminus', city: 'Mumbai', state: 'Maharashtra', zone: 'CR', lat: 19.0660, lng: 72.8997, aliases: ['Kurla'], major: true },
  { code: 'BCT', name: 'Mumbai Central', city: 'Mumbai', state: 'Maharashtra', zone: 'WR', lat: 18.9712, lng: 72.8194, major: true },
  { code: 'DR', name: 'Dadar', city: 'Mumbai', state: 'Maharashtra', zone: 'CR', lat: 19.0190, lng: 72.8440, major: true },
  { code: 'KYN', name: 'Kalyan Junction', city: 'Kalyan', district: 'Thane', state: 'Maharashtra', zone: 'CR', lat: 19.2350, lng: 73.1300 },
  { code: 'PUNE', name: 'Pune Junction', city: 'Pune', state: 'Maharashtra', zone: 'CR', lat: 18.5285, lng: 73.8743, major: true },
  { code: 'NGP', name: 'Nagpur Junction', city: 'Nagpur', state: 'Maharashtra', zone: 'CR', lat: 21.1530, lng: 79.0890, major: true },
  { code: 'NK', name: 'Nashik Road', city: 'Nashik', state: 'Maharashtra', zone: 'CR', lat: 19.9470, lng: 73.8350, keywords: ['Trimbakeshwar', 'Shirdi gateway'] },
  { code: 'MMR', name: 'Manmad Junction', city: 'Manmad', district: 'Nashik', state: 'Maharashtra', zone: 'CR', lat: 20.2540, lng: 74.4380, keywords: ['Shirdi'] },
  { code: 'BSL', name: 'Bhusaval Junction', city: 'Bhusawal', state: 'Maharashtra', zone: 'CR', lat: 21.0430, lng: 75.7850 },
  { code: 'SUR', name: 'Solapur Junction', city: 'Solapur', state: 'Maharashtra', zone: 'CR', lat: 17.6730, lng: 75.9180 },
  { code: 'KOP', name: 'Kolhapur', city: 'Kolhapur', state: 'Maharashtra', zone: 'CR', lat: 16.7050, lng: 74.2430, aliases: ['Chhatrapati Shahu Maharaj Terminus'], keywords: ['Mahalaxmi temple'] },
  { code: 'AWB', name: 'Aurangabad', city: 'Aurangabad', state: 'Maharashtra', zone: 'SCR', lat: 19.8950, lng: 75.3400, aliases: ['Chhatrapati Sambhajinagar'], keywords: ['Ajanta', 'Ellora'] },
  { code: 'NED', name: 'Hazur Sahib Nanded', city: 'Nanded', state: 'Maharashtra', zone: 'SCR', lat: 19.1450, lng: 77.3210 },

  // ════════════════════════════════════════════════════════════════════════
  // MADHYA PRADESH
  // ════════════════════════════════════════════════════════════════════════
  { code: 'BPL', name: 'Bhopal Junction', city: 'Bhopal', state: 'Madhya Pradesh', zone: 'WCR', lat: 23.2680, lng: 77.4030, major: true },
  { code: 'RKMP', name: 'Rani Kamalapati', city: 'Bhopal', state: 'Madhya Pradesh', zone: 'WCR', lat: 23.2310, lng: 77.4350, aliases: ['Habibganj'] },
  { code: 'INDB', name: 'Indore Junction', city: 'Indore', state: 'Madhya Pradesh', zone: 'WR', lat: 22.7150, lng: 75.8650, major: true },
  { code: 'UJN', name: 'Ujjain Junction', city: 'Ujjain', state: 'Madhya Pradesh', zone: 'WR', lat: 23.1800, lng: 75.7770, keywords: ['Mahakaleshwar'] },
  { code: 'GWL', name: 'Gwalior Junction', city: 'Gwalior', state: 'Madhya Pradesh', zone: 'NCR', lat: 26.2150, lng: 78.1700, major: true },
  { code: 'JBP', name: 'Jabalpur Junction', city: 'Jabalpur', state: 'Madhya Pradesh', zone: 'WCR', lat: 23.1620, lng: 79.9550, major: true },
  { code: 'ET', name: 'Itarsi Junction', city: 'Itarsi', district: 'Narmadapuram', state: 'Madhya Pradesh', zone: 'WCR', lat: 22.6140, lng: 77.7620, major: true },
  { code: 'KTE', name: 'Katni Junction', city: 'Katni', state: 'Madhya Pradesh', zone: 'WCR', lat: 23.8330, lng: 80.3940 },

  // ════════════════════════════════════════════════════════════════════════
  // CHHATTISGARH / JHARKHAND
  // ════════════════════════════════════════════════════════════════════════
  { code: 'R', name: 'Raipur Junction', city: 'Raipur', state: 'Chhattisgarh', zone: 'SECR', lat: 21.2510, lng: 81.6370, major: true },
  { code: 'BSP', name: 'Bilaspur Junction', city: 'Bilaspur', state: 'Chhattisgarh', zone: 'SECR', lat: 22.0810, lng: 82.1490, major: true },
  { code: 'DURG', name: 'Durg Junction', city: 'Durg', state: 'Chhattisgarh', zone: 'SECR', lat: 21.1900, lng: 81.2810 },
  { code: 'RNC', name: 'Ranchi Junction', city: 'Ranchi', state: 'Jharkhand', zone: 'SER', lat: 23.3700, lng: 85.3250, major: true },
  { code: 'DHN', name: 'Dhanbad Junction', city: 'Dhanbad', state: 'Jharkhand', zone: 'ECR', lat: 23.7950, lng: 86.4300, major: true },
  { code: 'TATA', name: 'Tatanagar Junction', city: 'Jamshedpur', state: 'Jharkhand', zone: 'SER', lat: 22.7780, lng: 86.1880, aliases: ['Jamshedpur'], major: true },
  { code: 'BKSC', name: 'Bokaro Steel City', city: 'Bokaro', state: 'Jharkhand', zone: 'SER', lat: 23.6650, lng: 86.1510 },
  { code: 'HTE', name: 'Hatia', city: 'Ranchi', state: 'Jharkhand', zone: 'SER', lat: 23.3170, lng: 85.2930 },

  // ════════════════════════════════════════════════════════════════════════
  // BIHAR
  // ════════════════════════════════════════════════════════════════════════
  { code: 'PNBE', name: 'Patna Junction', city: 'Patna', state: 'Bihar', zone: 'ECR', lat: 25.6020, lng: 85.1410, major: true },
  { code: 'GAYA', name: 'Gaya Junction', city: 'Gaya', state: 'Bihar', zone: 'ECR', lat: 24.7980, lng: 85.0020, keywords: ['Bodh Gaya', 'Mahabodhi'] },
  { code: 'MFP', name: 'Muzaffarpur Junction', city: 'Muzaffarpur', state: 'Bihar', zone: 'ECR', lat: 26.1200, lng: 85.3900 },
  { code: 'DBG', name: 'Darbhanga Junction', city: 'Darbhanga', state: 'Bihar', zone: 'ECR', lat: 26.1670, lng: 85.8970 },
  { code: 'BGP', name: 'Bhagalpur', city: 'Bhagalpur', state: 'Bihar', zone: 'ER', lat: 25.2440, lng: 86.9840 },
  { code: 'BJU', name: 'Barauni Junction', city: 'Barauni', district: 'Begusarai', state: 'Bihar', zone: 'ECR', lat: 25.4730, lng: 85.9700 },

  // ════════════════════════════════════════════════════════════════════════
  // ODISHA
  // ════════════════════════════════════════════════════════════════════════
  { code: 'BBS', name: 'Bhubaneswar', city: 'Bhubaneswar', state: 'Odisha', zone: 'ECoR', lat: 20.2700, lng: 85.8400, major: true },
  { code: 'PURI', name: 'Puri', city: 'Puri', state: 'Odisha', zone: 'ECoR', lat: 19.8050, lng: 85.8290, keywords: ['Jagannath temple', 'Konark'] },
  { code: 'CTC', name: 'Cuttack', city: 'Cuttack', state: 'Odisha', zone: 'ECoR', lat: 20.4720, lng: 85.8790 },
  { code: 'KUR', name: 'Khurda Road Junction', city: 'Khordha', state: 'Odisha', zone: 'ECoR', lat: 20.1830, lng: 85.6200, major: true },
  { code: 'SBP', name: 'Sambalpur Junction', city: 'Sambalpur', state: 'Odisha', zone: 'ECoR', lat: 21.4670, lng: 83.9700 },
  { code: 'BAM', name: 'Brahmapur', city: 'Brahmapur', state: 'Odisha', zone: 'ECoR', lat: 19.3140, lng: 84.7920, aliases: ['Berhampur', 'Berhampur (Odisha)'], keywords: ['Gopalpur'] },
  { code: 'BLS', name: 'Balasore', city: 'Balasore', state: 'Odisha', zone: 'SER', lat: 21.4940, lng: 86.9310, aliases: ['Baleshwar'] },
  { code: 'JSG', name: 'Jharsuguda Junction', city: 'Jharsuguda', state: 'Odisha', zone: 'ECoR', lat: 21.8550, lng: 84.0060 },

  // ════════════════════════════════════════════════════════════════════════
  // ASSAM & NORTH-EAST
  // ════════════════════════════════════════════════════════════════════════
  { code: 'GHY', name: 'Guwahati', city: 'Guwahati', state: 'Assam', zone: 'NFR', lat: 26.1820, lng: 91.7460, major: true, keywords: ['Kamakhya', 'Shillong gateway'] },
  { code: 'KYQ', name: 'Kamakhya Junction', city: 'Guwahati', state: 'Assam', zone: 'NFR', lat: 26.1690, lng: 91.6680 },
  { code: 'NBQ', name: 'New Bongaigaon Junction', city: 'Bongaigaon', state: 'Assam', zone: 'NFR', lat: 26.4860, lng: 90.5610 },
  { code: 'DBRG', name: 'Dibrugarh', city: 'Dibrugarh', state: 'Assam', zone: 'NFR', lat: 27.4720, lng: 94.9120 },
  { code: 'DMV', name: 'Dimapur', city: 'Dimapur', state: 'Nagaland', zone: 'NFR', lat: 25.9090, lng: 93.7270, keywords: ['Kohima gateway'] },
  { code: 'AGTL', name: 'Agartala', city: 'Agartala', state: 'Tripura', zone: 'NFR', lat: 23.8870, lng: 91.3140, major: true },

  // ════════════════════════════════════════════════════════════════════════
  // UTTARAKHAND
  // ════════════════════════════════════════════════════════════════════════
  { code: 'HW', name: 'Haridwar Junction', city: 'Haridwar', state: 'Uttarakhand', zone: 'NR', lat: 29.9540, lng: 78.1700, keywords: ['Rishikesh', 'Char Dham gateway'] },
  { code: 'DDN', name: 'Dehradun', city: 'Dehradun', state: 'Uttarakhand', zone: 'NR', lat: 30.3170, lng: 78.0290, major: true, keywords: ['Mussoorie'] },
  { code: 'RK', name: 'Roorkee', city: 'Roorkee', state: 'Uttarakhand', zone: 'NR', lat: 29.8650, lng: 77.8880 },
  { code: 'KGM', name: 'Kathgodam', city: 'Haldwani', state: 'Uttarakhand', zone: 'NER', lat: 29.2680, lng: 79.5410, keywords: ['Nainital', 'Kumaon gateway'] },

  // ════════════════════════════════════════════════════════════════════════
  // KARNATAKA (non-Konkan)
  // ════════════════════════════════════════════════════════════════════════
  { code: 'SBC', name: 'KSR Bengaluru City Junction', city: 'Bengaluru', state: 'Karnataka', zone: 'SWR', lat: 12.9783, lng: 77.5713, aliases: ['Bangalore City', 'KSR Bengaluru', 'Bangalore'], major: true },
  { code: 'YPR', name: 'Yesvantpur Junction', city: 'Bengaluru', state: 'Karnataka', zone: 'SWR', lat: 13.0250, lng: 77.5370, aliases: ['Yeshwantpur'], major: true },
  { code: 'MYS', name: 'Mysuru Junction', city: 'Mysuru', state: 'Karnataka', zone: 'SWR', lat: 12.3180, lng: 76.6410, aliases: ['Mysore'], major: true, keywords: ['Mysore Palace'] },
  { code: 'UBL', name: 'Hubballi Junction', city: 'Hubballi', state: 'Karnataka', zone: 'SWR', lat: 15.3450, lng: 75.1370, aliases: ['Hubli'], major: true },
  { code: 'BGM', name: 'Belagavi', city: 'Belagavi', state: 'Karnataka', zone: 'SWR', lat: 15.8500, lng: 74.5000, aliases: ['Belgaum'] },

  // ════════════════════════════════════════════════════════════════════════
  // TAMIL NADU
  // ════════════════════════════════════════════════════════════════════════
  { code: 'MAS', name: 'MGR Chennai Central', city: 'Chennai', state: 'Tamil Nadu', zone: 'SR', lat: 13.0827, lng: 80.2755, aliases: ['Chennai Central', 'Madras Central'], major: true },
  { code: 'MS', name: 'Chennai Egmore', city: 'Chennai', state: 'Tamil Nadu', zone: 'SR', lat: 13.0780, lng: 80.2610, aliases: ['Egmore'], major: true },
  { code: 'MDU', name: 'Madurai Junction', city: 'Madurai', state: 'Tamil Nadu', zone: 'SR', lat: 9.9180, lng: 78.1210, major: true, keywords: ['Meenakshi temple'] },
  { code: 'TPJ', name: 'Tiruchchirappalli Junction', city: 'Tiruchirappalli', state: 'Tamil Nadu', zone: 'SR', lat: 10.7990, lng: 78.6890, aliases: ['Trichy'], major: true },
  { code: 'CBE', name: 'Coimbatore Junction', city: 'Coimbatore', state: 'Tamil Nadu', zone: 'SR', lat: 11.0020, lng: 76.9660, major: true, keywords: ['Ooty gateway'] },
  { code: 'SA', name: 'Salem Junction', city: 'Salem', state: 'Tamil Nadu', zone: 'SR', lat: 11.6670, lng: 78.1370 },
  { code: 'ED', name: 'Erode Junction', city: 'Erode', state: 'Tamil Nadu', zone: 'SR', lat: 11.3410, lng: 77.7280 },
  { code: 'TEN', name: 'Tirunelveli Junction', city: 'Tirunelveli', state: 'Tamil Nadu', zone: 'SR', lat: 8.7130, lng: 77.7370 },
  { code: 'RMM', name: 'Rameswaram', city: 'Rameswaram', district: 'Ramanathapuram', state: 'Tamil Nadu', zone: 'SR', lat: 9.2880, lng: 79.3030, keywords: ['Ramanathaswamy temple'] },
  { code: 'KPD', name: 'Katpadi Junction', city: 'Vellore', state: 'Tamil Nadu', zone: 'SR', lat: 12.9700, lng: 79.1400, keywords: ['Vellore Fort'] },
  { code: 'TJ', name: 'Thanjavur Junction', city: 'Thanjavur', state: 'Tamil Nadu', zone: 'SR', lat: 10.7870, lng: 79.1380, aliases: ['Tanjore'] },
  { code: 'VM', name: 'Villupuram Junction', city: 'Villupuram', state: 'Tamil Nadu', zone: 'SR', lat: 11.9390, lng: 79.4920, keywords: ['Pondicherry gateway'] },

  // ════════════════════════════════════════════════════════════════════════
  // KERALA
  // ════════════════════════════════════════════════════════════════════════
  { code: 'TVC', name: 'Thiruvananthapuram Central', city: 'Thiruvananthapuram', state: 'Kerala', zone: 'SR', lat: 8.4880, lng: 76.9520, aliases: ['Trivandrum'], major: true, keywords: ['Kovalam', 'Padmanabhaswamy'] },
  { code: 'ERS', name: 'Ernakulam Junction', city: 'Kochi', state: 'Kerala', zone: 'SR', lat: 9.9700, lng: 76.2870, aliases: ['Cochin', 'Ernakulam South'], major: true, keywords: ['Fort Kochi'] },
  { code: 'ERN', name: 'Ernakulam Town', city: 'Kochi', state: 'Kerala', zone: 'SR', lat: 9.9980, lng: 76.2840, aliases: ['Ernakulam North'] },
  { code: 'QLN', name: 'Kollam Junction', city: 'Kollam', state: 'Kerala', zone: 'SR', lat: 8.8810, lng: 76.5980, aliases: ['Quilon'] },
  { code: 'ALLP', name: 'Alappuzha', city: 'Alappuzha', state: 'Kerala', zone: 'SR', lat: 9.4900, lng: 76.3360, aliases: ['Alleppey'], keywords: ['Backwaters', 'houseboat'] },
  { code: 'KTYM', name: 'Kottayam', city: 'Kottayam', state: 'Kerala', zone: 'SR', lat: 9.5920, lng: 76.5210 },
  { code: 'TCR', name: 'Thrissur', city: 'Thrissur', state: 'Kerala', zone: 'SR', lat: 10.5230, lng: 76.2140, aliases: ['Trichur'] },
  { code: 'CLT', name: 'Kozhikode', city: 'Kozhikode', state: 'Kerala', zone: 'SR', lat: 11.2470, lng: 75.7800, aliases: ['Calicut'] },
  { code: 'CAN', name: 'Kannur', city: 'Kannur', state: 'Kerala', zone: 'SR', lat: 11.8480, lng: 75.3700, aliases: ['Cannanore'] },
  { code: 'PGT', name: 'Palakkad Junction', city: 'Palakkad', state: 'Kerala', zone: 'SR', lat: 10.7900, lng: 76.6420, aliases: ['Palghat'] },
  { code: 'SRR', name: 'Shoranur Junction', city: 'Shoranur', district: 'Palakkad', state: 'Kerala', zone: 'SR', lat: 10.7620, lng: 76.2710 },

  // ════════════════════════════════════════════════════════════════════════
  // TELANGANA / ANDHRA PRADESH
  // ════════════════════════════════════════════════════════════════════════
  { code: 'SC', name: 'Secunderabad Junction', city: 'Secunderabad', state: 'Telangana', zone: 'SCR', lat: 17.4339, lng: 78.5018, major: true },
  { code: 'HYB', name: 'Hyderabad Deccan', city: 'Hyderabad', state: 'Telangana', zone: 'SCR', lat: 17.3850, lng: 78.4750, aliases: ['Nampally'], major: true, keywords: ['Charminar'] },
  { code: 'KCG', name: 'Kacheguda', city: 'Hyderabad', state: 'Telangana', zone: 'SCR', lat: 17.3920, lng: 78.5010 },
  { code: 'WL', name: 'Warangal', city: 'Warangal', state: 'Telangana', zone: 'SCR', lat: 17.9930, lng: 79.5970 },
  { code: 'BZA', name: 'Vijayawada Junction', city: 'Vijayawada', state: 'Andhra Pradesh', zone: 'SCR', lat: 16.5180, lng: 80.6190, major: true },
  { code: 'GNT', name: 'Guntur Junction', city: 'Guntur', state: 'Andhra Pradesh', zone: 'SCR', lat: 16.3070, lng: 80.4360 },
  { code: 'VSKP', name: 'Visakhapatnam Junction', city: 'Visakhapatnam', state: 'Andhra Pradesh', zone: 'ECoR', lat: 17.7170, lng: 83.3030, aliases: ['Vizag', 'Waltair'], major: true, keywords: ['Araku', 'RK Beach'] },
  { code: 'RJY', name: 'Rajahmundry', city: 'Rajahmundry', state: 'Andhra Pradesh', zone: 'SCR', lat: 16.9990, lng: 81.7800, aliases: ['Rajamahendravaram'] },
  { code: 'TPTY', name: 'Tirupati', city: 'Tirupati', state: 'Andhra Pradesh', zone: 'SCR', lat: 13.6360, lng: 79.4180, major: true, keywords: ['Tirumala', 'Balaji'] },
  { code: 'RU', name: 'Renigunta Junction', city: 'Renigunta', district: 'Tirupati', state: 'Andhra Pradesh', zone: 'SCR', lat: 13.6440, lng: 79.5160 },
  { code: 'GTL', name: 'Guntakal Junction', city: 'Guntakal', state: 'Andhra Pradesh', zone: 'SCR', lat: 15.1700, lng: 77.3660 },
]

/** Convenience: all distinct state names present in the master (sorted). */
export const RAILWAY_STATES: string[] = Array.from(
  new Set(RAILWAY_STATIONS.map((s) => s.state)),
).sort()
