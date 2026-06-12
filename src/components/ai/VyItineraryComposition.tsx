'use client'

/**
 * VyItineraryComposition — the NEW-LAYOUT Claude Design preview composition.
 *
 * This is presentation only. It is rendered by GeneratedItineraryPreview when
 * the active layout is "new" and receives the SAME computed data + handlers the
 * classic render uses. No business logic lives here: every edit, enrichment,
 * route-optimise, validation and save/apply/discard call is delegated straight
 * back to the parent. Built section-for-section from the design bundle's
 * create-trip/ItineraryPreview.jsx (ReviewBrief → RouteSummary → Transport →
 * Stay → DayCards w/ ActivityCards → Budget) so it matches the Voyago kit while
 * mapping the real generated itinerary data — nothing is faked.
 */

import { useState, type CSSProperties, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import StatTile from '@/components/vy/StatTile'
import BudgetMeter from '@/components/vy/BudgetMeter'
import WarningBanner from '@/components/vy/WarningBanner'
import TicketStatus from '@/components/vy/TicketStatus'
import { formatCurrency, formatDate } from '@/lib/utils'
import { fmtMins } from '@/lib/ai/activityDuration'
import { isTravelContextAfterDeparture, terminalDepartureIndex } from '@/lib/ai/routePlanning'
import type {
  ActivityCategory, GeneratedDayRoute, TimeZoneContext, SuggestedFoodItem,
  ActivityContext, EssentialSuggestion, BudgetCategoryKey,
} from '@/types'
import type { ItineraryValidationResult } from '@/lib/ai/itineraryValidation'
import type {
  EditableGeneratedActivity, EditableGeneratedDay, PreviewBudgetContext,
} from './GeneratedItineraryPreview'

// ── Category → design visual (icon + tone colours) ───────────────────────────
// Maps the app's real ActivityCategory set onto the design's category palette.
const CATEGORY_VISUAL: Record<string, { icon: string; fg: string; bg: string }> = {
  food:        { icon: 'utensils',           fg: 'var(--orange-600)', bg: '#FFF1E6' },
  sightseeing: { icon: 'camera-retro',       fg: 'var(--violet-700)', bg: 'var(--violet-50)' },
  hotel:       { icon: 'hotel',              fg: 'var(--coral-700)',  bg: 'var(--coral-50)' },
  transport:   { icon: 'route',              fg: 'var(--teal-700)',   bg: 'var(--teal-50)' },
  shopping:    { icon: 'bag-shopping',       fg: 'var(--sky-600)',    bg: 'var(--sky-50)' },
  adventure:   { icon: 'mountain-sun',       fg: 'var(--green-600)',  bg: 'var(--green-100)' },
  spiritual:   { icon: 'place-of-worship',   fg: 'var(--violet-700)', bg: 'var(--violet-50)' },
  leisure:     { icon: 'umbrella-beach',     fg: 'var(--sky-600)',    bg: 'var(--sky-50)' },
  emergency:   { icon: 'kit-medical',        fg: 'var(--coral-700)',  bg: 'var(--coral-50)' },
  other:       { icon: 'location-dot',       fg: 'var(--teal-700)',   bg: 'var(--teal-50)' },
}
function categoryVisual(cat: ActivityCategory) {
  return CATEGORY_VISUAL[cat] ?? CATEGORY_VISUAL.other
}

const CATEGORIES: ActivityCategory[] = [
  'sightseeing', 'food', 'hotel', 'transport', 'shopping',
  'adventure', 'spiritual', 'leisure', 'emergency', 'other',
]

const BUDGET_ICON: Record<BudgetCategoryKey, { icon: string; bg: string }> = {
  stay:            { icon: 'hotel',        bg: 'var(--violet-500)' },
  transport_to:    { icon: 'plane',        bg: 'var(--sky-400)' },
  local_transport: { icon: 'car',          bg: 'var(--teal-500)' },
  food:            { icon: 'utensils',     bg: 'var(--orange-500)' },
  activities:      { icon: 'mountain-sun', bg: 'var(--green-500)' },
  shopping:        { icon: 'bag-shopping', bg: 'var(--coral-500)' },
  buffer:          { icon: 'piggy-bank',   bg: 'var(--ink-400)' },
}

// ── small presentational helpers (pure; mirror the classic ones) ─────────────

function verifyState(a: EditableGeneratedActivity): 'verified' | 'unverified' | 'neutral' {
  if (a._enriched && a._placeId) return 'verified'
  if (a.needsVerification || (a._enriched && !a._placeId)) return 'unverified'
  return 'neutral'
}
function itemKey(item: SuggestedFoodItem, idx: number): string {
  return `${idx}:${item.name}`
}
function itemBasisLabel(basis: SuggestedFoodItem['basis'], confidence: SuggestedFoodItem['confidence']): string {
  switch (basis) {
    case 'user_entered': return 'Confirmed price'
    case 'official_menu_or_website': return 'Menu-based estimate'
    case 'google_review_item_mentions': return 'Review-mentioned dish'
    case 'google_review_price_clues': return 'Review-based estimate'
    case 'google_price_level': return 'Google price-level estimate'
    case 'restaurant_type_city_heuristic':
    default: return confidence === 'low' ? 'Heuristic estimate' : 'Estimate'
  }
}
function popularityHintLabel(hint: SuggestedFoodItem['popularityHint']): string | null {
  switch (hint) {
    case 'best_seller': return '★ Best seller'
    case 'popular': return '★ Popular'
    case 'often_mentioned': return 'Often mentioned'
    case 'recommended': return 'Recommended'
    default: return null
  }
}
function vegBadge(vegType: SuggestedFoodItem['vegType']): { label: string; tone: 'teal' | 'coral' } | null {
  if (vegType === 'veg') return { label: 'Veg', tone: 'teal' }
  if (vegType === 'vegan') return { label: 'Vegan', tone: 'teal' }
  if (vegType === 'non_veg') return { label: 'Non-veg', tone: 'coral' }
  return null
}
function aqiChipColor(category: string | undefined): string {
  const c = (category ?? '').toLowerCase()
  if (/(severe|hazardous|very poor|bad|unhealthy|poor)/.test(c)) return 'var(--coral-600)'
  if (/(moderate|satisfactory|low|acceptable)/.test(c)) return 'var(--sun-600)'
  if (/(good|excellent|clean)/.test(c)) return 'var(--green-600)'
  return 'var(--text-muted)'
}

// ── Section header (design SectionHead) ──────────────────────────────────────

function SectionHead({ icon, kicker, title, action }: { icon: string; kicker: string; title: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
      <span style={{ width: 38, height: 38, flex: '0 0 38px', borderRadius: 'var(--radius-md)', background: 'var(--teal-50)', color: 'var(--teal-600)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
        <i className={'fas fa-' + icon} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-faint)' }}>{kicker}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: 'var(--text-strong)', letterSpacing: '-0.01em' }}>{title}</div>
      </div>
      {action}
    </div>
  )
}

// ── Activity context lines (elevation / weather / AQI / warnings) ────────────

function VyContextLines({ ctx }: { ctx?: ActivityContext }) {
  if (!ctx) return null
  const hasElevation = ctx.elevationMeters != null
  const w = ctx.weatherSnapshot
  const hasWeather = w && w.source !== 'unavailable' && (w.temperatureC != null || w.condition || w.precipitationProbability != null)
  const aqi = ctx.aqiSnapshot
  const hasAqi = aqi && aqi.source !== 'unavailable' && aqi.aqi != null
  const warnings = ctx.contextWarnings ?? []
  if (!hasElevation && !hasWeather && !hasAqi && warnings.length === 0) return null
  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {(hasElevation || hasWeather || hasAqi) && (
        <div className="flex items-center flex-wrap gap-x-2.5 gap-y-0.5" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {hasElevation && (
            <span className="inline-flex items-center gap-1"><i className="fas fa-mountain" style={{ fontSize: 9, color: 'var(--ink-400)' }} />{ctx.elevationMeters!.toLocaleString()} m / {ctx.elevationFeet!.toLocaleString()} ft</span>
          )}
          {hasWeather && (
            <span className="inline-flex items-center gap-1"><i className="fas fa-cloud" style={{ fontSize: 9, color: 'var(--sky-400)' }} />{w!.temperatureC != null ? `${w!.temperatureC}°C` : ''}{w!.temperatureC != null && w!.condition ? ', ' : ''}{w!.condition ?? ''}{w!.confidence === 'low' ? ' (approx.)' : ''}</span>
          )}
          {hasWeather && w!.precipitationProbability != null && w!.precipitationProbability >= 40 && (
            <span className="inline-flex items-center gap-1" style={{ color: 'var(--sky-600)' }}><i className="fas fa-wind" style={{ fontSize: 9 }} />Rain risk: {Math.round(w!.precipitationProbability)}%</span>
          )}
          {hasAqi && (
            <span className="inline-flex items-center gap-1" style={{ color: aqiChipColor(aqi!.category) }}>AQI: {aqi!.aqi}{aqi!.category ? ` — ${aqi!.category}` : ''}</span>
          )}
        </div>
      )}
      {warnings.map((wn, i) => (
        <div key={i} className="flex items-start gap-1" style={{ fontSize: 11, color: 'var(--sun-600)' }}>
          <i className="fas fa-triangle-exclamation" style={{ fontSize: 9, marginTop: 2 }} /><span>{wn}</span>
        </div>
      ))}
    </div>
  )
}

// ── Suggested food items (editable: remove/restore recomputes budget) ────────

function VySuggestedItems({
  items, removedKeys, currency, travellerCount, onToggleItem,
}: {
  items: SuggestedFoodItem[]
  removedKeys: string[]
  currency: string
  travellerCount: number
  onToggleItem: (key: string) => void
}) {
  if (!items.length) return null
  const removed = new Set(removedKeys)
  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <p style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)' }}>Suggested items (est. prices)</p>
      {items.map((item, idx) => {
        const key = itemKey(item, idx)
        const isRemoved = removed.has(key)
        const badge = vegBadge(item.vegType)
        const ph = item.popularityHint && item.popularityHint !== 'unknown' ? popularityHintLabel(item.popularityHint) : null
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, fontSize: 11, opacity: isRemoved ? 0.45 : 1 }}>
            <button type="button" onClick={() => onToggleItem(key)} style={{ padding: 3, borderRadius: 5, background: 'transparent', border: 'none', cursor: 'pointer', color: isRemoved ? 'var(--text-muted)' : 'var(--coral-500)' }} title={isRemoved ? 'Add back (counts in budget)' : 'Remove (excluded from budget)'}>
              <i className={'fas fa-' + (isRemoved ? 'rotate-left' : 'trash-can')} style={{ fontSize: 10 }} />
            </button>
            <span style={{ fontWeight: 600, color: 'var(--text-strong)', textDecoration: isRemoved ? 'line-through' : undefined }}>{item.name}</span>
            {badge && <Badge size="sm" variant={badge.tone} style={{ fontSize: 9, padding: '2px 6px' }}>{badge.label}</Badge>}
            {ph && <Badge size="sm" variant="violet" style={{ fontSize: 9, padding: '2px 6px' }}>{ph}</Badge>}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-muted)' }}>{formatCurrency(item.estimatedPriceMin, currency)}–{formatCurrency(item.estimatedPriceMax, currency)}/person</span>
            <Badge size="sm" variant="neutral" style={{ fontSize: 9, padding: '2px 6px' }} title={item.sourceNote}>{itemBasisLabel(item.basis, item.confidence)}</Badge>
          </div>
        )
      })}
      <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>Prices are estimates — verify in person.{travellerCount > 1 ? ` Per-person × ${travellerCount} travellers.` : ''}</p>
    </div>
  )
}

// ── Activity card (design timeline look, fully editable) ─────────────────────

function VyActivityRow({
  act, days, dayDate, currency, travellerCount, suspect, nextActivityTitle,
  nextIsTravelContext, transportMode, connector, onPatch, onToggleRemove, onMove,
}: {
  act: EditableGeneratedActivity
  days: EditableGeneratedDay[]
  dayDate: string
  currency: string
  travellerCount: number
  suspect?: boolean
  nextActivityTitle?: string
  nextIsTravelContext?: boolean
  transportMode?: 'train' | 'flight' | 'bus' | 'car' | 'other'
  connector: boolean
  onPatch: (u: Partial<EditableGeneratedActivity>) => void
  onToggleRemove: () => void
  onMove: (toDate: string) => void
}) {
  const [open, setOpen] = useState(false)
  const v = verifyState(act)
  const c = categoryVisual(act.category)
  const removed = act._removed

  const isTerminal = !!act._terminalDeparture
  const departWord = transportMode === 'flight' ? 'flight' : transportMode === 'bus' ? 'bus' : transportMode === 'car' ? 'car' : 'train'
  const departTime = act._plannedStart ?? act.startTime

  const localityLabel = act._locationContext?.locality
    ? `${act._locationContext.locality}${act._locationContext.city && act._locationContext.city !== act._locationContext.locality ? `, ${act._locationContext.city}` : ''}`
    : act._locationContext?.city ?? undefined

  const hasDescription = !!(act.whyRecommended || act.foodInsightNotes || act.routeNotes || act._placeAddress || act.suggestedPlaceSearchQuery || act.timeToSpend)

  return (
    <div style={{ display: 'flex', gap: 12, fontFamily: 'var(--font-sans)', opacity: removed ? 0.5 : 1 }}>
      {/* time column */}
      <div style={{ flex: '0 0 50px', textAlign: 'right', paddingTop: 4 }}>
        <input
          value={act.startTime ?? ''}
          onChange={(e) => onPatch({ startTime: e.target.value })}
          placeholder="--:--"
          aria-label="Start time"
          style={{ width: '100%', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)', background: 'transparent', border: 'none', outline: 'none', padding: 0 }}
        />
      </div>
      {/* rail */}
      <div style={{ position: 'relative', flex: '0 0 18px', display: 'flex', justifyContent: 'center' }}>
        <span style={{ width: 14, height: 14, borderRadius: '50%', background: c.bg, border: `2.5px solid ${c.fg}`, marginTop: 6, zIndex: 1 }} />
        {connector && <span style={{ position: 'absolute', top: 22, bottom: -14, width: 0, borderLeft: '2px dotted var(--border-strong)' }} />}
      </div>
      {/* card */}
      <div style={{ flex: 1, minWidth: 0, marginBottom: 14 }}>
        <div style={{ background: removed ? 'var(--ink-50)' : 'var(--white)', border: `1px solid ${suspect ? '#F8C9C1' : 'var(--border-soft)'}`, borderRadius: 'var(--radius-lg)', padding: '12px 14px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={{ width: 36, height: 36, flex: '0 0 36px', borderRadius: 'var(--radius-md)', background: c.bg, color: c.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
              <i className={'fas fa-' + c.icon} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                value={act.title}
                onChange={(e) => onPatch({ title: e.target.value })}
                aria-label="Activity title"
                style={{ width: '100%', fontWeight: 700, fontSize: 14.5, color: 'var(--text-strong)', background: 'transparent', border: 'none', outline: 'none', padding: 0, fontFamily: 'var(--font-sans)' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 2, fontSize: 12.5, color: 'var(--text-muted)' }}>
                {localityLabel && <span><i className="fas fa-location-dot" style={{ color: 'var(--teal-400)', marginRight: 4 }} />{localityLabel}</span>}
                {!isTerminal && act._plannedStart && act._durationMins != null && act._durationMins > 0 && (
                  <span style={{ fontFamily: 'var(--font-mono)' }}><i className="fas fa-clock" style={{ marginRight: 4, fontFamily: 'Font Awesome 6 Free' }} />{fmtMins(act._durationMins)}</span>
                )}
              </div>
            </div>
            <input
              type="number" min="0"
              value={act.estimatedCost ?? 0}
              onChange={(e) => onPatch({ estimatedCost: Number(e.target.value) || 0 })}
              aria-label="Estimated cost"
              style={{ width: 70, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)', background: 'var(--ink-50)', border: '1px solid var(--border-soft)', borderRadius: 8, padding: '5px 7px', outline: 'none' }}
            />
            <button onClick={onToggleRemove} title={removed ? 'Restore' : 'Remove'} style={{ flex: '0 0 auto', width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: removed ? 'var(--text-muted)' : 'var(--coral-500)' }}>
              <i className={'fas fa-' + (removed ? 'rotate-left' : 'trash-can')} style={{ fontSize: 13 }} />
            </button>
            {(hasDescription || act.restaurantSuggestion) && (
              <button onClick={() => setOpen(!open)} aria-label="Toggle details" style={{ flex: '0 0 auto', width: 24, color: 'var(--text-faint)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <i className="fas fa-chevron-down" style={{ fontSize: 13, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--dur-base) var(--ease-out)' }} />
              </button>
            )}
          </div>

          {/* trust / status badges */}
          <div className="flex items-center flex-wrap gap-1.5" style={{ marginTop: 8 }}>
            {act.isBreak && <Badge variant="orange" size="sm">Break</Badge>}
            {v === 'verified' && !suspect && <Badge variant="teal" size="sm"><i className="fas fa-shield-check" style={{ fontSize: 9 }} /> Verified</Badge>}
            {suspect && <Badge variant="coral" size="sm"><i className="fas fa-shield-halved" style={{ fontSize: 9 }} /> Verify match</Badge>}
            {v === 'unverified' && !suspect && <Badge variant="sun" size="sm"><i className="fas fa-triangle-exclamation" style={{ fontSize: 9 }} /> Unverified</Badge>}
            {act._autoCategory && <Badge variant="violet" size="sm">Auto-category</Badge>}
            {act._placeRating != null && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>★ {act._placeRating}{act._placeUserRatings ? ` (${act._placeUserRatings})` : ''}</span>}
            {act._mealTimeIssue && <Badge variant="sun" size="sm"><i className="fas fa-triangle-exclamation" style={{ fontSize: 8 }} /> Meal time adjusted</Badge>}
            {act._onboardMeal && <Badge variant="sky" size="sm">Onboard / packed</Badge>}
            {act._terminalDeparture && <Badge variant="violet" size="sm"><i className="fas fa-train" style={{ fontSize: 9 }} /> Departure</Badge>}
          </div>

          {/* terminal departure / planned timing / travel-to-next */}
          {isTerminal ? (
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8, fontSize: 12, color: 'var(--violet-600)', fontWeight: 600 }}>
              <i className="fas fa-location-arrow" style={{ fontSize: 10 }} />
              <span>Station buffer / boarding</span>
              {departTime && (<><span style={{ color: 'var(--border-strong)' }}>·</span><span>Depart by {departWord} at {departTime}</span></>)}
              {nextIsTravelContext && nextActivityTitle && <span style={{ color: 'var(--violet-400)', fontWeight: 400 }}>→ {nextActivityTitle}</span>}
            </div>
          ) : (
            act._travelToNextMins != null && nextActivityTitle && (
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 8, fontSize: 11.5, color: 'var(--teal-600)' }}>
                <i className="fas fa-route" style={{ fontSize: 10 }} />
                <span>Next: {act._travelToNextDistText ?? fmtMins(act._travelToNextMins)}{act._travelToNextDistKm ? ` / ${act._travelToNextDistKm}` : ''} to {nextActivityTitle}</span>
                {act._travelRouteSource === 'estimate' && <span style={{ color: 'var(--text-faint)' }}>(est.)</span>}
                {act._travelBufferMins != null && act._travelBufferMins > 0 && <span style={{ color: 'var(--text-faint)' }} title={act._travelBufferNote}>incl. +{act._travelBufferMins} min buffer</span>}
              </div>
            )
          )}

          {/* restaurant suggestion (food) */}
          {act.restaurantSuggestion && act.category === 'food' && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--green-700)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <i className="fas fa-shield-check" style={{ fontSize: 10 }} />
              <span style={{ fontWeight: 600 }}>{act.restaurantSuggestion.name}</span>
              {act.restaurantSuggestion.rating != null && <span style={{ color: 'var(--text-muted)' }}>★{act.restaurantSuggestion.rating}</span>}
              {act.estimatedSpendRange && (
                <span style={{ color: 'var(--text-muted)' }}>· ≈{formatCurrency(act.estimatedSpendRange.perPersonMin, currency)}–{formatCurrency(act.estimatedSpendRange.perPersonMax, currency)}/person{act.spendConfidence === 'high' ? '' : ' (est.)'}</span>
              )}
            </div>
          )}

          <VyContextLines ctx={act._activityContext} />

          {/* expandable drawer: description, tips, food items + edit controls */}
          {open && (hasDescription || act.restaurantSuggestion) && (
            <div style={{ marginTop: 11, paddingTop: 11, borderTop: '1px dashed var(--border-subtle)' }}>
              {act.whyRecommended && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--text-body)' }}>{act.whyRecommended}</p>}
              {act.foodInsightNotes && <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}><i className="fas fa-utensils" style={{ marginRight: 6, fontSize: 10 }} />{act.foodInsightNotes}</p>}
              {act.routeNotes && <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}><i className="fas fa-compass" style={{ marginRight: 6, fontSize: 10 }} />{act.routeNotes}</p>}
              {act.timeToSpend && <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}><i className="fas fa-hourglass-half" style={{ marginRight: 6, fontSize: 10 }} />Suggested time: {act.timeToSpend}</p>}
              {act._mealTimeIssue && <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--sun-600)' }}><i className="fas fa-triangle-exclamation" style={{ marginRight: 6, fontSize: 10 }} />{act._mealTimeIssue}</p>}
              {act.menuSourceUrl && (
                <a href={act.menuSourceUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 6, fontSize: 11, color: 'var(--teal-600)' }} title="Opens the restaurant's official website in a new tab">
                  Menu/website available — prices still shown as estimates unless parsed confidently.
                </a>
              )}
              {act.suggestedItems && act.suggestedItems.length > 0 && (
                <VySuggestedItems
                  items={act.suggestedItems}
                  removedKeys={act._removedItemKeys ?? []}
                  currency={currency}
                  travellerCount={travellerCount}
                  onToggleItem={(key) => {
                    const current = act._removedItemKeys ?? []
                    const nextRemoved = current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
                    const removedSet = new Set(nextRemoved)
                    const items = act.suggestedItems ?? []
                    const perPersonMid = items.reduce((sum, it, idx) => removedSet.has(itemKey(it, idx)) ? sum : sum + (it.estimatedPriceMin + it.estimatedPriceMax) / 2, 0)
                    const n = Math.max(1, travellerCount)
                    onPatch({ _removedItemKeys: nextRemoved, estimatedCost: Math.round(perPersonMid * n), estimatedCostPerPerson: Math.round(perPersonMid) })
                  }}
                />
              )}
              {act._placeAddress && <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--text-faint)' }}><i className="fas fa-location-dot" style={{ marginRight: 6 }} />{act._placeAddress}</p>}

              {/* edit controls */}
              <div className="grid sm:grid-cols-2 gap-2" style={{ marginTop: 10 }}>
                <label style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  Category
                  <select value={act.category} onChange={(e) => onPatch({ category: e.target.value as ActivityCategory, _autoCategory: false })} className="mt-0.5 w-full" style={{ fontSize: 12.5, background: 'var(--ink-50)', borderRadius: 8, padding: '6px 10px', border: '1px solid var(--border-soft)', display: 'block', outline: 'none' }}>
                    {CATEGORIES.map((cc) => <option key={cc} value={cc}>{cc}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  Move to day
                  <select value={dayDate} onChange={(e) => onMove(e.target.value)} className="mt-0.5 w-full" style={{ fontSize: 12.5, background: 'var(--ink-50)', borderRadius: 8, padding: '6px 10px', border: '1px solid var(--border-soft)', display: 'block', outline: 'none' }}>
                    {days.map((d) => <option key={d.date} value={d.date}>Day {d.dayNumber} ({formatDate(d.date)})</option>)}
                  </select>
                </label>
                <label className="sm:col-span-2" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  Location
                  <input value={act.locationName ?? ''} onChange={(e) => onPatch({ locationName: e.target.value })} placeholder="Place / area" className="mt-0.5 w-full" style={{ fontSize: 12.5, background: 'var(--ink-50)', borderRadius: 8, padding: '6px 10px', border: '1px solid var(--border-soft)', display: 'block', outline: 'none' }} />
                </label>
                {act.estimatedCostPerPerson != null && <p className="sm:col-span-2" style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>Per head ≈ {formatCurrency(act.estimatedCostPerPerson, currency)}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Day card (collapsible, design look) ──────────────────────────────────────

function VyDayCard({
  day, index, currency, travellerCount, validation, route, busy, optimisingDay,
  mapsAvailable, transportMode, onOptimiseDay, onPatch, onToggleRemove, onMove,
}: {
  day: EditableGeneratedDay
  index: number
  currency: string
  travellerCount: number
  validation: ItineraryValidationResult
  route?: GeneratedDayRoute
  busy: boolean
  optimisingDay: string | null
  mapsAvailable: boolean
  transportMode?: 'train' | 'flight' | 'bus' | 'car' | 'other'
  onOptimiseDay: (date: string) => void
  onPatch: (dayDate: string, key: string, u: Partial<EditableGeneratedActivity>) => void
  onToggleRemove: (dayDate: string, key: string) => void
  onMove: (fromDate: string, key: string, toDate: string) => void
}) {
  const [open, setOpen] = useState(index === 0)
  const visible = day.activities.filter((a) => !a._removed)
  const dayCost = visible.reduce((s, a) => s + (a.estimatedCost || 0), 0)
  const dayGeocoded = visible.filter((a) => a._lat != null).length
  const ts = day._timingSummary
  const warnText = ts?.chronoWarning || ts?.paceWarning
  const warnTone: 'warn' | 'info' = ts?.chronoWarning ? 'warn' : 'info'

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>
      {/* header */}
      <div onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', cursor: 'pointer' }}>
        <span style={{ width: 44, height: 44, flex: '0 0 44px', borderRadius: 'var(--radius-md)', background: 'var(--grad-brand)', color: '#fff', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
          <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.85, letterSpacing: '0.05em' }}>DAY</span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18 }}>{day.dayNumber}</span>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.01em' }}>{day.theme || `Day ${day.dayNumber}`}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {formatDate(day.date)} · {visible.length} stops
            {route && <> · <i className="fas fa-route" style={{ margin: '0 4px', color: 'var(--teal-400)' }} />{route.distanceKm} km</>}
          </div>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)' }}>{formatCurrency(dayCost, currency)}</span>
        {warnText && <i className="fas fa-triangle-exclamation" style={{ color: warnTone === 'warn' ? 'var(--sun-500)' : 'var(--sky-500)', fontSize: 14 }} />}
        <i className="fas fa-chevron-down" style={{ color: 'var(--text-faint)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--dur-base) var(--ease-out)' }} />
      </div>

      {open && (
        <div style={{ padding: '2px 16px 16px' }}>
          {/* day route + optimise controls */}
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1" style={{ marginBottom: 12, fontSize: 11.5 }}>
            {route ? (
              <>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600, color: route.stale ? 'var(--sun-600)' : 'var(--teal-600)' }}>
                  <i className="fas fa-route" style={{ fontSize: 10 }} /> {route.stops} stops · ≈ {route.distanceKm} km{route.durationText !== '—' ? ` · ${route.durationText}` : ''}
                </span>
                {!route.stale && route.optimiseStatus === 'optimised' && <Badge variant="sky" size="sm"><i className="fas fa-check" style={{ fontSize: 9 }} /> Optimised{route.timingsUpdated ? ' · timings updated' : ''}</Badge>}
                {!route.stale && route.optimiseStatus === 'fallback' && <Badge variant="sun" size="sm">Optimised (straight-line)</Badge>}
                {!route.stale && route.optimiseStatus === 'failed' && <Badge variant="neutral" size="sm">Optimise unavailable</Badge>}
                {route.stale && (
                  <button onClick={() => onOptimiseDay(day.date)} disabled={busy || dayGeocoded < 2} className="inline-flex items-center gap-1 disabled:opacity-50" style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'var(--sun-50)', color: 'var(--sun-600)', border: 'none', cursor: 'pointer' }}>
                    {optimisingDay === day.date ? <Loader2 size={9} className="animate-spin" /> : <i className="fas fa-rotate" style={{ fontSize: 9 }} />} Re-optimise
                  </button>
                )}
              </>
            ) : dayGeocoded >= 2 && mapsAvailable ? (
              <button onClick={() => onOptimiseDay(day.date)} disabled={busy} className="inline-flex items-center gap-1 disabled:opacity-50" style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'var(--teal-50)', color: 'var(--teal-700)', border: 'none', cursor: 'pointer' }}>
                {optimisingDay === day.date ? <Loader2 size={9} className="animate-spin" /> : <i className="fas fa-route" style={{ fontSize: 9 }} />} Optimise day route
              </button>
            ) : null}
            {ts && <span style={{ color: 'var(--text-muted)' }}>Activities {fmtMins(ts.activityMins)}{ts.travelMins > 0 ? ` · Travel ${fmtMins(ts.travelMins)}` : ''} · Ends {ts.dayEnd}</span>}
          </div>

          {/* timing/chrono warning banner */}
          {warnText && (
            <div style={{ marginBottom: 14 }}>
              <WarningBanner tone={warnTone} title={warnTone === 'warn' ? 'Timing needs review' : 'Pacing note'}>{warnText}</WarningBanner>
            </div>
          )}

          {/* carry suggestions */}
          {day._essentials && day._essentials.length > 0 && (
            <div style={{ marginBottom: 14, borderRadius: 'var(--radius-md)', background: 'var(--sun-50)', border: '1px solid #F4E2A8', padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--sun-600)', marginBottom: 6 }}><i className="fas fa-suitcase-rolling" /> Carry suggestions</div>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {day._essentials.map((e: EssentialSuggestion, i: number) => (
                  <li key={i} style={{ fontSize: 11.5, color: 'var(--text-body)', lineHeight: 1.4 }}>
                    <span style={{ fontWeight: 700, color: e.priority === 'must_carry' ? 'var(--coral-600)' : e.priority === 'recommended' ? 'var(--sun-600)' : 'var(--text-muted)' }}>{e.priority === 'must_carry' ? 'Must carry' : e.priority === 'recommended' ? 'Recommended' : 'Optional'}:</span>{' '}
                    <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{e.item}</span> — {e.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* activity timeline */}
          {day.activities.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-faint)', padding: '6px 0' }}>No activities.</p>
          ) : (
            day.activities.map((act) => {
              const vis = day.activities.filter((a) => !a._removed)
              const idx = vis.findIndex((a) => a._key === act._key)
              const nxt = vis[idx + 1]
              return (
                <VyActivityRow
                  key={act._key}
                  act={act}
                  days={[day]}
                  dayDate={day.date}
                  currency={currency}
                  travellerCount={travellerCount}
                  suspect={validation.suspectKeys.has(act._key)}
                  nextActivityTitle={nxt?.title}
                  nextIsTravelContext={!!nxt && (nxt._onboardMeal || isTravelContextAfterDeparture(nxt))}
                  transportMode={transportMode}
                  connector={idx >= 0 && idx < vis.length - 1}
                  onPatch={(u) => onPatch(day.date, act._key, u)}
                  onToggleRemove={() => onToggleRemove(day.date, act._key)}
                  onMove={(toDate) => onMove(day.date, act._key, toDate)}
                />
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

// ── Transport section (conditional on real planned transport) ────────────────

function VyTransportSection({ transport, currency }: { transport: NonNullable<PreviewBudgetContext['plannedTransport']>; currency: string }) {
  if (!transport.length) return null
  const modeIcon: Record<string, string> = { train: 'train', flight: 'plane', bus: 'bus', car: 'car', other: 'route' }
  return (
    <section>
      <SectionHead icon="plane" kicker="GETTING THERE & BACK" title="Transport" />
      <div className="grid sm:grid-cols-2 gap-4">
        {transport.map((t, i) => (
          <div key={i} style={{ background: 'var(--white)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>
            <div style={{ background: 'var(--grad-brand)', color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontWeight: 700, fontSize: 14 }}><i className={'fas fa-' + (modeIcon[t.mode] ?? 'route')} /> {t.mode.charAt(0).toUpperCase() + t.mode.slice(1)}</span>
              <TicketStatus status="estimated" onLight size="sm" />
            </div>
            <div style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, color: 'var(--text-strong)' }}>{t.origin ?? '—'}</div>
                  {t.departure && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.departure}</div>}
                </div>
                <i className="fas fa-arrow-right-long" style={{ color: 'var(--teal-400)' }} />
                <div style={{ minWidth: 0, textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, color: 'var(--text-strong)' }}>{t.destination ?? '—'}</div>
                  {t.arrival && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.arrival}</div>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--border-subtle)', fontSize: 12.5, color: 'var(--text-muted)' }}>
                {t.bookingRef ? <span>Ref <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-body)' }}>{t.bookingRef}</span></span> : <span>Estimate</span>}
                {t.totalCost != null && <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-strong)' }}>{formatCurrency(t.totalCost, currency)}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Stay section (conditional on real planned stay) ──────────────────────────

function VyStaySection({ stay, currency }: { stay: NonNullable<PreviewBudgetContext['plannedStay']>; currency: string }) {
  if (!stay.name && !stay.area) return null
  return (
    <section>
      <SectionHead icon="hotel" kicker="WHERE YOU'LL STAY" title="Accommodation" />
      <div style={{ background: 'var(--white)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-md)', overflow: 'hidden', maxWidth: 460 }}>
        <div style={{ background: 'var(--grad-mint)', height: 8 }} />
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--text-strong)' }}>{stay.name ?? stay.area}</div>
              {stay.area && stay.name && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}><i className="fas fa-location-dot" style={{ color: 'var(--teal-400)', marginRight: 5 }} />{stay.area}</div>}
            </div>
            <TicketStatus status="estimated" size="sm" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--border-subtle)', fontSize: 12.5, color: 'var(--text-muted)' }}>
            {stay.checkIn && <span><span style={{ fontWeight: 700, color: 'var(--text-faint)', fontSize: 10, letterSpacing: '0.08em' }}>CHECK-IN </span>{stay.checkIn}</span>}
            {stay.checkOut && <span><span style={{ fontWeight: 700, color: 'var(--text-faint)', fontSize: 10, letterSpacing: '0.08em' }}>CHECK-OUT </span>{stay.checkOut}</span>}
            {stay.rooms != null && <span><span style={{ fontWeight: 700, color: 'var(--text-faint)', fontSize: 10, letterSpacing: '0.08em' }}>ROOMS </span>{stay.rooms}</span>}
            {stay.totalCost != null && <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-strong)' }}>{formatCurrency(stay.totalCost, currency)}</span>}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Budget section (BudgetMeter + breakdown) ─────────────────────────────────

interface BudgetSplit {
  rows: { key: BudgetCategoryKey; label: string; amount: number; included: boolean }[]
  includedTotal: number
  budget: number
  remaining: number
  overBudget: boolean
  perHead: number
}

function VyBudgetSection({ split, fallbackTotal, currency, travellerCount }: { split: BudgetSplit | null; fallbackTotal: number; currency: string; travellerCount: number }) {
  const meterCurrency = currency === 'INR' ? '₹' : currency
  const total = split && split.budget > 0 ? split.budget : fallbackTotal
  const spent = split ? split.includedTotal : fallbackTotal
  const rows = split ? split.rows.filter((r) => r.included && r.amount > 0) : []
  return (
    <section>
      <SectionHead icon="wallet" kicker="WHAT IT'LL COST" title="Budget summary" />
      <div className="grid lg:grid-cols-[300px_1fr] gap-4 items-start">
        <BudgetMeter total={total} spent={spent} currency={meterCurrency} gradient="brand" />
        <div style={{ background: 'var(--white)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          {rows.length > 0 ? rows.map((it, i) => {
            const vis = BUDGET_ICON[it.key]
            return (
              <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--border-soft)' }}>
                <span style={{ width: 34, height: 34, flex: '0 0 34px', borderRadius: '50%', background: vis.bg, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}><i className={'fas fa-' + vis.icon} /></span>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: 'var(--text-strong)' }}>{it.label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: 'var(--text-strong)' }}>{formatCurrency(it.amount, currency)}</span>
              </div>
            )
          }) : (
            <div style={{ padding: '16px', fontSize: 13, color: 'var(--text-muted)' }}>Estimated activity spend across all days.</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px', background: 'var(--teal-50)' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--teal-800)' }}>Estimated total</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: 'var(--teal-700)' }}>{formatCurrency(spent, currency)}</span>
          </div>
          {split && (
            <div style={{ padding: '10px 16px', fontSize: 11.5, color: 'var(--text-faint)', borderTop: '1px solid var(--border-soft)' }}>
              Per head (included) ≈ {formatCurrency(split.perHead, currency)}. Excluded categories aren&apos;t compared against the budget.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// ── Props bag ────────────────────────────────────────────────────────────────

export interface VyItineraryProps {
  result: import('@/types').TripGeneratorResult
  currency: string
  travellerCount: number
  isMock: boolean
  applying: boolean
  applyNote: string | null
  mapsAvailable: boolean
  applyLabel: string
  applyingLabel: string
  transportMode?: 'train' | 'flight' | 'bus' | 'car' | 'other'
  budgetContext?: PreviewBudgetContext
  destinationContext?: { city?: string; lat?: number; lng?: number }
  editDays: EditableGeneratedDay[]
  dayRoutes: Record<string, GeneratedDayRoute>
  stats: { total: number; count: number; verified: number; unverified: number; withQuery: number; perHead: number }
  geocodedCount: number
  budgetSplit: BudgetSplit | null
  validation: ItineraryValidationResult
  timeZone: TimeZoneContext | null
  enrichNote: string | null
  autoRunning: boolean
  busy: boolean
  enriching: boolean
  optimisingAll: boolean
  optimisingDay: string | null
  anyStale: boolean
  hasUnverified: boolean
  confirmSave: boolean
  onEnrich: (onlyUnverified: boolean) => void
  onOptimiseAll: () => void
  onOptimiseDay: (date: string) => void
  onPatch: (dayDate: string, key: string, u: Partial<EditableGeneratedActivity>) => void
  onToggleRemove: (dayDate: string, key: string) => void
  onMove: (fromDate: string, key: string, toDate: string) => void
  onApplyClick: () => void
  onRegenerate: () => void
  onDiscard: () => void
}

// ── Main composition ─────────────────────────────────────────────────────────

export default function VyItineraryComposition(p: VyItineraryProps) {
  const {
    result, currency, travellerCount, isMock, applying, applyNote, mapsAvailable,
    applyLabel, applyingLabel, transportMode, budgetContext, destinationContext,
    editDays, dayRoutes, stats, geocodedCount, budgetSplit, validation, timeZone,
    enrichNote, autoRunning, busy, enriching, optimisingAll, optimisingDay, anyStale,
    hasUnverified, confirmSave, onEnrich, onOptimiseAll, onOptimiseDay, onPatch,
    onToggleRemove, onMove, onApplyClick, onRegenerate, onDiscard,
  } = p

  const c = result.comfortSummary
  const destName = destinationContext?.city || budgetContext?.stayBaseLabel
  const totalKm = Object.values(dayRoutes).reduce((s, r) => s + (r.distanceKm || 0), 0)

  // ReviewBrief fact pills — only real, available values.
  const facts: { icon: string; v: string }[] = []
  if (destName) facts.push({ icon: 'location-dot', v: destName })
  facts.push({ icon: 'calendar-day', v: `${editDays.length} ${editDays.length === 1 ? 'day' : 'days'}` })
  facts.push({ icon: 'users', v: `${travellerCount} ${travellerCount === 1 ? 'traveller' : 'travellers'}` })
  if (c.paceRisk) facts.push({ icon: 'gauge-high', v: `${c.paceRisk} pace` })
  if (budgetContext?.budget) facts.push({ icon: 'wallet', v: formatCurrency(budgetContext.budget, currency) })
  if (transportMode) facts.push({ icon: transportMode === 'flight' ? 'plane-departure' : transportMode === 'train' ? 'train' : 'route', v: `by ${transportMode}` })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26, fontFamily: 'var(--font-sans)' }}>
      {/* ReviewBrief — aurora hero */}
      <section style={{ background: 'var(--grad-aurora)', borderRadius: 'var(--radius-xl)', padding: 22, color: 'var(--white)', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.12em', opacity: 0.92 }}>
              <i className="fas fa-wand-magic-sparkles" style={{ marginRight: 7 }} />HERE&apos;S WHAT I PLANNED
            </div>
            <h2 style={{ color: 'var(--white)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 25, marginTop: 8, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              {editDays.length}-day{destName ? ` trip to ${destName}` : ' itinerary'}
            </h2>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 'var(--radius-pill)', padding: '5px 11px', fontSize: 12, fontWeight: 700 }}>
              <i className="fas fa-circle-check" style={{ fontSize: 11 }} />{result.confidence} confidence
            </span>
            {isMock && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 'var(--radius-pill)', padding: '5px 11px', fontSize: 12, fontWeight: 700 }}>Dev mock</span>}
          </div>
        </div>
        {result.tripSummary && <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.55, color: 'rgba(255,255,255,0.92)' }}>{result.tripSummary}</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          {facts.map((f, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 'var(--radius-pill)', padding: '7px 13px', fontSize: 13, fontWeight: 600 }}>
              <i className={'fas fa-' + f.icon} style={{ opacity: 0.9 }} />{f.v}
            </span>
          ))}
        </div>
        {result.approximateLabel && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, fontSize: 12.5, color: 'rgba(255,255,255,0.85)' }}>
            <i className="fas fa-circle-info" style={{ marginTop: 2 }} /><span>{result.approximateLabel}</span>
          </div>
        )}
      </section>

      {/* RouteSummary stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon="location-dot" value={stats.count} label="Places" tone="teal" />
        <StatTile icon="calendar-day" value={editDays.length} label="Days" tone="violet" />
        <StatTile icon="shield-halved" value={`${stats.verified}/${stats.count}`} label="Verified" tone={stats.verified > 0 ? 'green' : 'sun'} />
        <StatTile icon={totalKm > 0 ? 'route' : 'wallet'} value={totalKm > 0 ? `${Math.round(totalKm)} km` : formatCurrency(stats.total, currency)} label={totalKm > 0 ? 'Total route' : 'Est. total'} tone="coral" />
      </div>

      {/* result-level warnings */}
      {result.warnings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {result.warnings.map((w, i) => <WarningBanner key={i} tone="warn">{w}</WarningBanner>)}
        </div>
      )}

      {/* Transport (only if real data) */}
      {budgetContext?.plannedTransport && budgetContext.plannedTransport.length > 0 && (
        <VyTransportSection transport={budgetContext.plannedTransport} currency={currency} />
      )}

      {/* Stay (only if real data) */}
      {budgetContext?.plannedStay && (budgetContext.plannedStay.name || budgetContext.plannedStay.area) && (
        <VyStaySection stay={budgetContext.plannedStay} currency={currency} />
      )}

      {/* Toolbar — verify / optimise */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'var(--surface-glass)', backdropFilter: 'var(--blur-md)', WebkitBackdropFilter: 'var(--blur-md)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-soft)' }}>
        <Button size="sm" variant="secondary" onClick={() => onEnrich(false)} disabled={busy || stats.withQuery === 0 || !mapsAvailable}>
          {enriching ? <Loader2 size={13} className="animate-spin" /> : <i className="fas fa-location-dot" />} {enriching ? 'Verifying…' : 'Verify all with Google'}
        </Button>
        {hasUnverified && (
          <Button size="sm" variant="secondary" onClick={() => onEnrich(true)} disabled={busy || !mapsAvailable}>
            <i className="fas fa-triangle-exclamation" /> Resolve unverified ({stats.unverified})
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={onOptimiseAll} disabled={busy || geocodedCount < 2 || !mapsAvailable}>
          {optimisingAll ? <Loader2 size={13} className="animate-spin" /> : <i className="fas fa-route" />} {optimisingAll ? 'Optimising…' : anyStale ? 'Re-optimise routes' : 'Optimise routes'}
        </Button>
        {autoRunning && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--sky-600)' }}><Loader2 size={12} className="animate-spin" /> Verifying & optimising…</span>}
        {!mapsAvailable && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Google Maps not configured — places stay unverified.</span>}
        {geocodedCount > 0 && <span style={{ fontSize: 12, color: 'var(--green-600)', fontWeight: 600 }}>{geocodedCount} located</span>}
      </div>
      {enrichNote && <p style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginTop: -16 }}><i className="fas fa-circle-info" /> {enrichNote}</p>}
      {timeZone?.timeZoneId && timeZone.timeZoneId !== 'Asia/Kolkata' && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginTop: -16 }}><i className="fas fa-clock" /> Destination time zone: {timeZone.timeZoneName ?? timeZone.timeZoneId}</p>
      )}

      {/* Generated itinerary — day cards */}
      <section>
        <SectionHead icon="map-location-dot" kicker="DAY BY DAY" title="Generated itinerary"
          action={budgetContext?.stayBaseLabel ? <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><i className="fas fa-house" style={{ color: 'var(--teal-500)' }} />Base: {budgetContext.stayBaseLabel}</span> : undefined} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {editDays.map((d, i) => (
            <VyDayCard
              key={d.date}
              day={d}
              index={i}
              currency={currency}
              travellerCount={travellerCount}
              validation={validation}
              route={dayRoutes[d.date]}
              busy={busy}
              optimisingDay={optimisingDay}
              mapsAvailable={mapsAvailable}
              transportMode={transportMode}
              onOptimiseDay={onOptimiseDay}
              onPatch={onPatch}
              onToggleRemove={onToggleRemove}
              onMove={onMove}
            />
          ))}
        </div>
      </section>

      {/* Budget */}
      <VyBudgetSection split={budgetSplit} fallbackTotal={stats.total} currency={currency} travellerCount={travellerCount} />

      {/* comfort / route notes */}
      {(result.routeSummary.logic || c.notes.length > 0) && (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {result.routeSummary.logic && <p><i className="fas fa-compass" style={{ marginRight: 6, color: 'var(--teal-500)' }} />{result.routeSummary.logic}</p>}
          {c.notes.map((n, i) => <p key={i}>· {n}</p>)}
        </div>
      )}

      {/* validation banner */}
      {validation.needsReview && (
        <WarningBanner tone="warn" title="This itinerary needs review before saving">
          <ul style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {validation.issues.slice(0, 5).map((iss, i) => <li key={i} style={{ fontSize: 12.5 }}>· {iss.message}</li>)}
          </ul>
        </WarningBanner>
      )}
      {hasUnverified && (
        <p style={{ fontSize: 12.5, color: 'var(--sun-600)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="fas fa-triangle-exclamation" /> {stats.unverified} place(s) are unverified AI suggestions.{mapsAvailable ? ' Use “Resolve unverified” to confirm them.' : ' Edit them manually before applying.'}
        </p>
      )}
      {applyNote && <p style={{ fontSize: 13, color: 'var(--green-600)', display: 'flex', alignItems: 'center', gap: 6 }}><i className="fas fa-circle-check" /> {applyNote}</p>}

      {/* action bar */}
      <div style={{ position: 'sticky', bottom: 0, display: 'flex', flexWrap: 'wrap', gap: 10, padding: '14px 0', background: 'linear-gradient(to top, var(--background) 70%, transparent)' }}>
        <Button onClick={onApplyClick} disabled={applying || busy} variant={validation.needsReview && confirmSave ? 'secondary' : 'primary'} className="flex-1 min-w-[160px]">
          {applying ? <Loader2 size={15} className="animate-spin" /> : <i className="fas fa-check" />}
          {applying ? applyingLabel : validation.needsReview ? (confirmSave ? 'Save anyway' : 'Review & save…') : applyLabel}
        </Button>
        <Button variant="secondary" onClick={onRegenerate} disabled={applying || busy}><i className="fas fa-wand-magic-sparkles" /> Regenerate</Button>
        <Button variant="ghost" onClick={onDiscard} disabled={applying || busy}>Discard</Button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.5, marginTop: -6 }}>
        Past/completed days are protected. Generated activities are saved as planned estimates and marked as AI-generated — they never overwrite your confirmed or completed activities.
      </p>
    </div>
  )
}
