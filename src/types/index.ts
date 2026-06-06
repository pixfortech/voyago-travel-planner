export interface UserProfile {
  id: string
  name: string
  color: string
  createdAt: string
}

export type TripType =
  | 'solo'
  | 'couple'
  | 'friends'
  | 'group'
  | 'family'
  | 'office'
  | 'pilgrimage'
  | 'wedding'

export interface Traveller {
  id: string
  name: string
  color: string
  initials: string
}

export interface Trip {
  id: string
  name: string
  destination: string
  type: TripType
  startDate: string
  endDate: string
  budget: number
  currency: string
  ownerId: string
  members: string[]
  coverColor: string
  notes: string
  travellers?: Traveller[]
  createdAt: string
  updatedAt: string
}

export type ActivityType = 'hotel' | 'transport' | 'activity' | 'food' | 'other'

export interface Activity {
  id: string
  type: ActivityType
  title: string
  notes: string
  time: string
  cost: number
  confirmed: boolean
}

export interface ItineraryDay {
  id: string
  tripId: string
  date: string
  dayNumber: number
  activities: Activity[]
}

export type ExpenseCategory =
  | 'accommodation'
  | 'transport'
  | 'food'
  | 'activities'
  | 'shopping'
  | 'other'

export interface Expense {
  id: string
  tripId: string
  category: ExpenseCategory
  title: string
  amount: number
  date: string
  notes: string
  paidByTravellerId?: string
  paidByName?: string
  splitType?: 'equal' | 'custom'
  participants?: string[]
  createdAt: string
}
