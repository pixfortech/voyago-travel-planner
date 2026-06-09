import type { ActivityCategory } from '@/types'

const PLACE_TYPE_MAP: Record<string, ActivityCategory> = {
  restaurant: 'food',
  cafe: 'food',
  bakery: 'food',
  meal_takeaway: 'food',
  meal_delivery: 'food',
  bar: 'food',
  food: 'food',
  night_club: 'food',
  coffee_shop: 'food',
  ice_cream_shop: 'food',
  fast_food_restaurant: 'food',
  pizza_restaurant: 'food',

  lodging: 'hotel',
  hotel: 'hotel',
  motel: 'hotel',
  hostel: 'hotel',
  guest_house: 'hotel',
  resort_hotel: 'hotel',

  tourist_attraction: 'sightseeing',
  museum: 'sightseeing',
  art_gallery: 'sightseeing',
  zoo: 'sightseeing',
  aquarium: 'sightseeing',
  park: 'sightseeing',
  national_park: 'sightseeing',
  point_of_interest: 'sightseeing',
  landmark: 'sightseeing',
  natural_feature: 'sightseeing',
  monument: 'sightseeing',
  historical_place: 'sightseeing',
  historical_landmark: 'sightseeing',
  sculpture: 'sightseeing',
  waterfall: 'sightseeing',
  beach: 'sightseeing',
  botanical_garden: 'sightseeing',
  wildlife_park: 'sightseeing',

  hindu_temple: 'spiritual',
  church: 'spiritual',
  mosque: 'spiritual',
  synagogue: 'spiritual',
  place_of_worship: 'spiritual',
  temple: 'spiritual',
  jain_temple: 'spiritual',
  buddhist_temple: 'spiritual',
  shrine: 'spiritual',

  airport: 'transport',
  train_station: 'transport',
  bus_station: 'transport',
  subway_station: 'transport',
  taxi_stand: 'transport',
  transit_station: 'transport',
  light_rail_station: 'transport',
  ferry_terminal: 'transport',
  bus_stop: 'transport',
  car_rental: 'transport',

  shopping_mall: 'shopping',
  store: 'shopping',
  market: 'shopping',
  clothing_store: 'shopping',
  jewellery_store: 'shopping',
  jewelry_store: 'shopping',
  department_store: 'shopping',
  electronics_store: 'shopping',
  furniture_store: 'shopping',
  home_goods_store: 'shopping',
  supermarket: 'shopping',
  convenience_store: 'shopping',
  book_store: 'shopping',
  shoe_store: 'shopping',
  toy_store: 'shopping',
  gift_shop: 'shopping',
  grocery_store: 'shopping',
  street_market: 'shopping',

  amusement_park: 'adventure',
  campground: 'adventure',
  hiking_area: 'adventure',
  stadium: 'adventure',
  sports_complex: 'adventure',
  sports_club: 'adventure',
  water_park: 'adventure',
  ski_resort: 'adventure',

  spa: 'leisure',
  resort: 'leisure',
  beauty_salon: 'leisure',
  gym: 'leisure',
  fitness_center: 'leisure',
  swimming_pool: 'leisure',
  golf_course: 'leisure',
  bowling_alley: 'leisure',
  movie_theater: 'leisure',
  night_club_bar: 'leisure',

  hospital: 'emergency',
  pharmacy: 'emergency',
  police: 'emergency',
  doctor: 'emergency',
  dentist: 'emergency',
  fire_station: 'emergency',
  emergency_room: 'emergency',
  urgent_care: 'emergency',
}

/** Priority order — first matched category wins when a place has multiple relevant types. */
const PRIORITY: ActivityCategory[] = [
  'food',
  'hotel',
  'transport',
  'spiritual',
  'emergency',
  'shopping',
  'adventure',
  'leisure',
  'sightseeing',
  'other',
]

/**
 * Map an array of Google place types to the best-fit Voyago ActivityCategory.
 * Returns 'other' when no known type is found.
 */
export function mapPlaceTypesToCategory(types: string[]): ActivityCategory {
  if (!types || types.length === 0) return 'other'

  const found = new Set<ActivityCategory>()
  for (const t of types) {
    const cat = PLACE_TYPE_MAP[t.toLowerCase()]
    if (cat) found.add(cat)
  }

  for (const cat of PRIORITY) {
    if (found.has(cat)) return cat
  }
  return 'other'
}
