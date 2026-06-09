/**
 * Bill Spend Analysis — shared helpers (Phase 14).
 *
 * Import-safe on both client and server: no secrets, no `server-only`.
 *
 * Analyses MANUALLY-ENTERED bill fields and returns a structured DRAFT the user
 * must confirm before any expense is created/updated. Image OCR/vision is NOT
 * implemented (Coming Soon). The AI must ignore/redact any sensitive payment data
 * (card numbers, phone numbers) if present in the notes.
 */

import type {
  BillAnalysisInput,
  BillAnalysisResult,
  BillConfidence,
  BillExtractedItem,
} from '@/types'
import type { ExpenseCategory, VendorType } from '@/types'

export const BILL_ANALYSIS_SYSTEM_PROMPT = `You are a careful expense assistant for travellers.
You are given MANUALLY-ENTERED bill fields (vendor, date, total, tax, items). You did NOT read
an image — never claim to have scanned a receipt.

Rules:
- Produce a DRAFT only. The user will review and confirm before any expense is saved.
- Suggest a sensible expense category and vendor type from the data.
- If a total and traveller count are present, suggest a per-person split.
- Ignore and never repeat card numbers, phone numbers, UPI ids or any sensitive payment data;
  if you see them, add a warning that they were redacted.
- Be honest about confidence — manual entry with few fields is low confidence.
- Return ONLY valid JSON. No markdown, no code blocks, no commentary.`

export function buildBillAnalysisUserMessage(input: BillAnalysisInput): string {
  return `Trip: "${input.tripName}" to ${input.destination} (${input.currency}), ${input.travellerCount} traveller(s)

Manually entered bill fields:
Vendor: ${input.vendorName ?? 'unknown'}
Date: ${input.date ?? 'unknown'}
Total: ${input.total ?? 'unknown'}
Tax: ${input.tax ?? 'unknown'}
Service charge: ${input.serviceCharge ?? 'unknown'}
Items:
${(input.items ?? []).map((i) => `  - ${i.name}${i.quantity ? ` x${i.quantity}` : ''}${i.amount != null ? ` = ${i.amount}` : ''}`).join('\n') || '  (none provided)'}
Notes: ${input.notes ?? 'none'}

Return a JSON object matching this shape:
{
  "summary": "One-sentence plain summary of the bill",
  "detectedVendor": "...",
  "detectedDate": "YYYY-MM-DD",
  "detectedTotal": 0,
  "detectedTax": 0,
  "detectedItems": [{ "name": "...", "quantity": 1, "amount": 0 }],
  "suggestedCategory": "food",
  "suggestedVendorType": "restaurant",
  "perPersonSplit": 0,
  "confidence": "low|medium|high",
  "warnings": ["..."]
}

Valid categories: accommodation, transport, food, activities, shopping, other
Valid vendor types: restaurant, hotel, transport, tickets, shopping, emergency, miscellaneous`
}

const VALID_CATEGORIES: ReadonlySet<ExpenseCategory> = new Set<ExpenseCategory>([
  'accommodation',
  'transport',
  'food',
  'activities',
  'shopping',
  'other',
])

const VALID_VENDOR_TYPES: ReadonlySet<VendorType> = new Set<VendorType>([
  'restaurant',
  'hotel',
  'transport',
  'tickets',
  'shopping',
  'emergency',
  'miscellaneous',
])

const VALID_CONFIDENCE: ReadonlySet<BillConfidence> = new Set<BillConfidence>([
  'low',
  'medium',
  'high',
])

function normaliseCategory(raw: unknown): ExpenseCategory {
  return typeof raw === 'string' && VALID_CATEGORIES.has(raw as ExpenseCategory)
    ? (raw as ExpenseCategory)
    : 'food'
}

function normaliseVendorType(raw: unknown): VendorType {
  return typeof raw === 'string' && VALID_VENDOR_TYPES.has(raw as VendorType)
    ? (raw as VendorType)
    : 'restaurant'
}

function normaliseConfidence(raw: unknown): BillConfidence {
  return typeof raw === 'string' && VALID_CONFIDENCE.has(raw as BillConfidence)
    ? (raw as BillConfidence)
    : 'low'
}

function normaliseItems(raw: unknown): BillExtractedItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((it) => {
      const o = it as Record<string, unknown>
      if (!o || typeof o.name !== 'string') return null
      return {
        name: o.name,
        quantity: o.quantity != null ? Number(o.quantity) : undefined,
        amount: o.amount != null ? Number(o.amount) : undefined,
      } as BillExtractedItem
    })
    .filter((x): x is BillExtractedItem => x !== null)
}

export function parseBillAnalysisResult(
  text: string,
  input: BillAnalysisInput,
): BillAnalysisResult {
  try {
    const clean = text.replace(/```json|```/g, '').trim()
    const raw = JSON.parse(clean) as Record<string, unknown>
    return {
      summary: String(raw.summary || 'Bill draft prepared.'),
      detectedVendor: raw.detectedVendor ? String(raw.detectedVendor) : input.vendorName,
      detectedDate: raw.detectedDate ? String(raw.detectedDate) : input.date,
      detectedTotal: raw.detectedTotal != null ? Number(raw.detectedTotal) : input.total,
      detectedTax: raw.detectedTax != null ? Number(raw.detectedTax) : input.tax,
      detectedItems: normaliseItems(raw.detectedItems).length
        ? normaliseItems(raw.detectedItems)
        : input.items ?? [],
      suggestedCategory: normaliseCategory(raw.suggestedCategory),
      suggestedVendorType: normaliseVendorType(raw.suggestedVendorType),
      perPersonSplit: raw.perPersonSplit != null ? Number(raw.perPersonSplit) : undefined,
      confidence: normaliseConfidence(raw.confidence),
      warnings: Array.isArray(raw.warnings) ? (raw.warnings as string[]).map(String) : [],
    }
  } catch {
    return mockBillAnalysisResult(input)
  }
}

export function mockBillAnalysisResult(input: BillAnalysisInput): BillAnalysisResult {
  const total = input.total ?? 0
  const count = Math.max(input.travellerCount, 1)
  const fieldsPresent = [input.vendorName, input.date, input.total].filter(Boolean).length

  return {
    summary: input.vendorName
      ? `Bill from ${input.vendorName}${total ? ` for ${input.currency} ${total}` : ''}. Review and confirm before saving.`
      : 'Manual bill draft prepared. Review and confirm before saving.',
    detectedVendor: input.vendorName,
    detectedDate: input.date,
    detectedTotal: input.total,
    detectedTax: input.tax,
    detectedItems: input.items ?? [],
    suggestedCategory: 'food',
    suggestedVendorType: 'restaurant',
    perPersonSplit: total > 0 ? Math.round((total / count) * 100) / 100 : undefined,
    confidence: fieldsPresent >= 3 ? 'medium' : 'low',
    warnings: [
      'This is a development mock draft built from your manual entries.',
      'Always review every field before confirming — nothing is saved until you confirm.',
    ],
  }
}
