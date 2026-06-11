/**
 * Meal-time sanity validator — Phase 16G hotfix PART 7.
 *
 * Enforces realistic meal-time windows for food activities and detects mismatches
 * like "Dinner" scheduled at 16:45 (should be relabelled "Snack / café").
 *
 * Windows (all times HH:MM, India heuristics):
 *   Breakfast:   07:00 – 10:30
 *   Lunch:       12:00 – 15:30
 *   Snack / café:16:00 – 18:30
 *   Dinner:      19:00 – 22:30
 *
 * `validateMealTime` returns an issue when the activity's scheduled time falls
 * outside the expected window for its mealType.
 * `repairMealCategory` returns the corrected mealType for the given time.
 */

export type MealType = 'breakfast' | 'lunch' | 'snack' | 'cafe' | 'dinner'

interface MealWindow {
  startMins: number
  endMins: number
  label: string
  /** mealType values that belong in this window */
  types: MealType[]
}

const h = (hh: number, mm = 0) => hh * 60 + mm

const MEAL_WINDOWS: MealWindow[] = [
  { startMins: h(7),  endMins: h(10, 30), label: 'Breakfast',   types: ['breakfast'] },
  { startMins: h(12), endMins: h(15, 30), label: 'Lunch',       types: ['lunch'] },
  { startMins: h(16), endMins: h(18, 30), label: 'Snack / café', types: ['snack', 'cafe'] },
  { startMins: h(19), endMins: h(22, 30), label: 'Dinner',      types: ['dinner'] },
]

function toMins(hhmm: string): number | null {
  const [hh, mm] = hhmm.split(':').map(Number)
  if (hh == null || isNaN(hh) || mm == null || isNaN(mm)) return null
  return hh * 60 + mm
}

function windowForType(mt: MealType): MealWindow | null {
  return MEAL_WINDOWS.find((w) => (w.types as string[]).includes(mt)) ?? null
}

function bestWindowForTime(timeMins: number): MealWindow {
  // Find the window the time actually falls in.
  for (const w of MEAL_WINDOWS) {
    if (timeMins >= w.startMins && timeMins <= w.endMins) return w
  }
  // Between windows: pick nearest by midpoint distance.
  let best = MEAL_WINDOWS[0]!
  let bestDist = Infinity
  for (const w of MEAL_WINDOWS) {
    const mid = (w.startMins + w.endMins) / 2
    const dist = Math.abs(timeMins - mid)
    if (dist < bestDist) { bestDist = dist; best = w }
  }
  return best
}

export interface MealTimeIssue {
  /** The window the mealType belongs in (e.g. "Dinner: 19:00–22:30"). */
  expectedWindow: string
  /** Suggested corrected mealType. */
  suggestedMealType: MealType
  /** Human-readable advisory message. */
  message: string
  severity: 'warning'
}

/** HH:MM → "HH:MM" with zero-padding. */
function fmtW(mins: number): string {
  const h2 = Math.floor(mins / 60).toString().padStart(2, '0')
  const m2 = (mins % 60).toString().padStart(2, '0')
  return `${h2}:${m2}`
}

/**
 * Returns an issue when `mealType` is scheduled at a time outside its expected
 * window. Returns null when the time is valid or inputs are missing.
 */
export function validateMealTime(mealType: string, timeHHMM?: string): MealTimeIssue | null {
  if (!timeHHMM || !mealType) return null
  const timeMins = toMins(timeHHMM)
  if (timeMins == null) return null

  const knownMealTypes: MealType[] = ['breakfast', 'lunch', 'snack', 'cafe', 'dinner']
  if (!(knownMealTypes as string[]).includes(mealType)) return null

  const win = windowForType(mealType as MealType)
  if (!win) return null

  if (timeMins >= win.startMins && timeMins <= win.endMins) return null // ✓ valid

  const bestWin = bestWindowForTime(timeMins)
  const suggested = bestWin.types[0]!
  return {
    expectedWindow: `${win.label}: ${fmtW(win.startMins)}–${fmtW(win.endMins)}`,
    suggestedMealType: suggested,
    message: `"${win.label}" at ${timeHHMM} is outside the expected window (${fmtW(win.startMins)}–${fmtW(win.endMins)}) — consider labelling it "${bestWin.label}".`,
    severity: 'warning',
  }
}

/**
 * Returns the corrected mealType for a given scheduled time, or the original
 * mealType if no correction is needed.
 */
export function repairMealCategory(mealType: string, timeHHMM?: string): string {
  const issue = validateMealTime(mealType, timeHHMM)
  return issue ? issue.suggestedMealType : mealType
}

// ── Post-departure meal conversion (terminal-anchor hotfix PART 3) ────────────

export interface ConvertedMeal {
  /** New, travel-appropriate activity title. */
  title: string
  /** Short explanatory note for the card. */
  note: string
}

/**
 * A meal cannot be eaten at a city restaurant once the traveller has boarded.
 * Convert it to a realistic travel-context meal — packed food, station food,
 * or an onboard meal — chosen by the scheduled time and transport mode.
 */
export function convertMealForTravel(
  timeHHMM: string | undefined,
  mode: 'train' | 'flight' | 'bus' | 'car' | 'other' | undefined,
): ConvertedMeal {
  const onboardWord =
    mode === 'flight' ? 'onboard the flight'
    : mode === 'bus' ? 'on the bus'
    : mode === 'car' ? 'en route'
    : 'onboard the train'

  const mins = timeHHMM ? toMins(timeHHMM) : null
  // Identify the meal by time so the wording matches (lunch / dinner / snack).
  let mealWord = 'meal'
  if (mins != null) {
    if (mins >= h(7) && mins < h(11)) mealWord = 'breakfast'
    else if (mins >= h(11) && mins < h(16)) mealWord = 'lunch'
    else if (mins >= h(16) && mins < h(19)) mealWord = 'snack'
    else mealWord = 'dinner'
  }

  if (mode === 'flight') {
    return {
      title: `Pre-flight ${mealWord} or ${onboardWord}`,
      note: `Eat before security or have the ${mealWord} ${onboardWord} — no city restaurant stop after departure.`,
    }
  }
  return {
    title: `Packed ${mealWord} / ${mealWord} ${onboardWord}`,
    note: `Grab station food before boarding or carry a packed ${mealWord} — no city restaurant stop after departure.`,
  }
}
