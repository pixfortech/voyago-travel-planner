import type {
  Expense,
  Traveller,
  ExpenseCategory,
  VendorType,
  SettlementStatus,
} from '@/types'

/**
 * Money rounding strategy
 * -----------------------
 * Stored expense amounts are in rupees (a `number`). Dividing rupees with
 * floating point drifts (e.g. ₹3,412 ÷ 8 = ₹426.50, but naive sums can be off by
 * a paisa). To stay deterministic and rounding-safe, every calculation here:
 *
 *   1. Converts rupees → integer paise via `toPaise` (Math.round(rupees * 100)).
 *   2. Performs all division / splitting in integer paise.
 *   3. Distributes any leftover paise to the *earliest* participants (`splitPaise`)
 *      so the shares always sum back to exactly the original total — no lost or
 *      phantom paise.
 *   4. Converts back to rupees (`toRupees`) only for display.
 *
 * This guarantees `sum(shares) === total` and that two runs produce identical
 * numbers. All helpers are pure (no I/O, no mutation of inputs).
 */

export const toPaise = (rupees: number): number => Math.round((rupees || 0) * 100)
export const toRupees = (paise: number): number => paise / 100

// Whole-rupee rounding, used where sub-rupee precision is not meaningful.
export function roundCurrency(amount: number): number {
  return Math.round(amount)
}

/**
 * Split an integer-paise total into `n` deterministic shares. Any remainder paise
 * are handed to the earliest participants so the parts sum exactly to the total.
 */
export function splitPaise(totalPaise: number, n: number): number[] {
  if (n <= 0) return []
  const base = Math.floor(totalPaise / n)
  const remainder = totalPaise - base * n
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0))
}

/**
 * Resolve the traveller ids an expense is split among. Backward compatible:
 * - explicit `participants` are honoured (filtered to ids that still exist);
 * - otherwise the expense is split across every traveller on the trip.
 */
export function getExpenseParticipants(
  expense: Expense,
  travellers: Traveller[]
): string[] {
  if (expense.participants && expense.participants.length > 0) {
    const valid = expense.participants.filter((id) =>
      travellers.some((t) => t.id === id)
    )
    if (valid.length > 0) return valid
  }
  return travellers.map((t) => t.id)
}

/** Per-participant share of one expense, in integer paise, keyed by traveller id. */
export function getExpenseSharesPaise(
  expense: Expense,
  travellers: Traveller[]
): Map<string, number> {
  const participants = getExpenseParticipants(expense, travellers)
  const shares = splitPaise(toPaise(expense.amount), participants.length)
  const map = new Map<string, number>()
  participants.forEach((id, i) => map.set(id, shares[i] ?? 0))
  return map
}

// ── Budget analytics ─────────────────────────────────────────────────────────

export function getTotalSpent(expenses: Expense[]): number {
  const paise = expenses.reduce((sum, e) => sum + toPaise(e.amount), 0)
  return toRupees(paise)
}

export function getRemainingBudget(budget: number, expenses: Expense[]): number {
  return toRupees(toPaise(budget) - toPaise(getTotalSpent(expenses)))
}

export function getBudgetUsagePercent(budget: number, expenses: Expense[]): number {
  if (budget <= 0) return 0
  return (getTotalSpent(expenses) / budget) * 100
}

export function getPerHeadBudget(budget: number, travellerCount: number): number {
  const n = Math.max(travellerCount, 1)
  return toRupees(Math.round(toPaise(budget) / n))
}

export function getPerHeadActualCost(
  expenses: Expense[],
  travellerCount: number
): number {
  const n = Math.max(travellerCount, 1)
  return toRupees(Math.round(toPaise(getTotalSpent(expenses)) / n))
}

export interface CategoryTotal {
  category: ExpenseCategory
  total: number
}

export function getCategoryTotals(expenses: Expense[]): CategoryTotal[] {
  const order: ExpenseCategory[] = [
    'accommodation',
    'transport',
    'food',
    'activities',
    'shopping',
    'other',
  ]
  return order
    .map((category) => ({
      category,
      total: toRupees(
        expenses
          .filter((e) => e.category === category)
          .reduce((s, e) => s + toPaise(e.amount), 0)
      ),
    }))
    .filter((c) => c.total > 0)
}

export interface VendorTypeTotal {
  vendorType: VendorType
  total: number
}

export function getVendorTypeTotals(expenses: Expense[]): VendorTypeTotal[] {
  const totals = new Map<VendorType, number>()
  for (const e of expenses) {
    if (!e.vendorType) continue
    totals.set(e.vendorType, (totals.get(e.vendorType) ?? 0) + toPaise(e.amount))
  }
  return Array.from(totals.entries())
    .map(([vendorType, paise]) => ({ vendorType, total: toRupees(paise) }))
    .sort((a, b) => b.total - a.total)
}

export interface DayTotal {
  date: string
  total: number
}

export function getDayWiseTotals(expenses: Expense[]): DayTotal[] {
  const totals = new Map<string, number>()
  for (const e of expenses) {
    if (!e.date) continue
    totals.set(e.date, (totals.get(e.date) ?? 0) + toPaise(e.amount))
  }
  return Array.from(totals.entries())
    .map(([date, paise]) => ({ date, total: toRupees(paise) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ── Traveller ledger ─────────────────────────────────────────────────────────

export interface TravellerBalance {
  travellerId: string
  name: string
  color: string
  initials: string
  totalPaid: number
  totalShare: number
  net: number
  toReceive: number
  toPay: number
}

/**
 * Per-traveller ledger across the given (already payer-tagged) expenses.
 * net = paid − owed share. Positive ⇒ receivable, negative ⇒ payable.
 * Pass only expenses that have a payer so the ledger always nets to ~zero.
 */
export function getTravellerBalances(
  expenses: Expense[],
  travellers: Traveller[]
): TravellerBalance[] {
  return travellers.map((traveller) => {
    let paidPaise = 0
    let sharePaise = 0
    for (const e of expenses) {
      if (e.paidByTravellerId === traveller.id) paidPaise += toPaise(e.amount)
      sharePaise += getExpenseSharesPaise(e, travellers).get(traveller.id) ?? 0
    }
    const netPaise = paidPaise - sharePaise
    return {
      travellerId: traveller.id,
      name: traveller.name,
      color: traveller.color,
      initials: traveller.initials,
      totalPaid: toRupees(paidPaise),
      totalShare: toRupees(sharePaise),
      net: toRupees(netPaise),
      toReceive: netPaise > 0 ? toRupees(netPaise) : 0,
      toPay: netPaise < 0 ? toRupees(-netPaise) : 0,
    }
  })
}

// ── Suggested settle-up (who pays whom) ──────────────────────────────────────

export interface Settlement {
  from: string
  fromName: string
  fromColor: string
  to: string
  toName: string
  toColor: string
  amount: number
}

/** Greedy minimal-transfer settle-up derived from net balances. */
export function getSettlementSummary(balances: TravellerBalance[]): Settlement[] {
  const settlements: Settlement[] = []
  const creditors = balances
    .filter((b) => b.net > 0)
    .map((b) => ({ ...b, rem: toPaise(b.net) }))
  const debtors = balances
    .filter((b) => b.net < 0)
    .map((b) => ({ ...b, rem: toPaise(-b.net) }))

  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]
    const creditor = creditors[j]
    const amountPaise = Math.min(debtor.rem, creditor.rem)

    if (amountPaise > 0) {
      settlements.push({
        from: debtor.travellerId,
        fromName: debtor.name,
        fromColor: debtor.color,
        to: creditor.travellerId,
        toName: creditor.name,
        toColor: creditor.color,
        amount: toRupees(amountPaise),
      })
    }

    debtor.rem -= amountPaise
    creditor.rem -= amountPaise
    if (debtor.rem <= 0) i++
    if (creditor.rem <= 0) j++
  }

  return settlements
}

// ── Per-expense settlement tracking ──────────────────────────────────────────

export interface SettlementParticipant {
  travellerId: string
  name: string
  color: string
  initials: string
  shareAmount: number
  received: boolean
}

export interface ExpenseSettlementRow {
  expenseId: string
  title: string
  payerId: string
  payerName: string
  amount: number
  splitCount: number
  perHead: number
  // Everyone who owes the payer (i.e. participants excluding the payer).
  participants: SettlementParticipant[]
  totalReceivable: number
  receivedAmount: number
  pendingAmount: number
  pendingParticipants: SettlementParticipant[]
  status: SettlementStatus
}

/**
 * Build the settlement view for one expense: who owes the payer, how much, and
 * whether they've settled (per `settledParticipantIds`). Returns null for
 * expenses with no payer (untracked / shared expenses).
 */
export function getExpenseSettlementRow(
  expense: Expense,
  travellers: Traveller[]
): ExpenseSettlementRow | null {
  if (!expense.paidByTravellerId) return null

  const sharesPaise = getExpenseSharesPaise(expense, travellers)
  const settled = new Set(expense.settledParticipantIds ?? [])
  const splitCount = sharesPaise.size || 1

  const owing = Array.from(sharesPaise.entries()).filter(
    ([id]) => id !== expense.paidByTravellerId
  )

  const participants: SettlementParticipant[] = owing.map(([id, sharePaise]) => {
    const t = travellers.find((tr) => tr.id === id)
    return {
      travellerId: id,
      name: t?.name || 'Unknown',
      color: t?.color || '#94a3b8',
      initials: t?.initials || '?',
      shareAmount: toRupees(sharePaise),
      received: settled.has(id),
    }
  })

  const totalReceivablePaise = owing.reduce((s, [, p]) => s + p, 0)
  const receivedPaise = owing
    .filter(([id]) => settled.has(id))
    .reduce((s, [, p]) => s + p, 0)
  const pendingPaise = totalReceivablePaise - receivedPaise

  const status: SettlementStatus =
    pendingPaise <= 0
      ? 'received'
      : receivedPaise > 0
      ? 'partially_received'
      : 'pending'

  return {
    expenseId: expense.id,
    title: expense.title,
    payerId: expense.paidByTravellerId,
    payerName: expense.paidByName || '',
    amount: expense.amount,
    splitCount,
    perHead: toRupees(splitPaise(toPaise(expense.amount), splitCount)[0] ?? 0),
    participants,
    totalReceivable: toRupees(totalReceivablePaise),
    receivedAmount: toRupees(receivedPaise),
    pendingAmount: toRupees(pendingPaise),
    pendingParticipants: participants.filter((p) => !p.received),
    status,
  }
}

export interface ReceivedPendingStatus {
  totalReceivable: number
  totalReceived: number
  totalPending: number
}

/** Trip-wide received vs pending totals across all tracked expenses. */
export function getReceivedPendingStatus(
  expenses: Expense[],
  travellers: Traveller[]
): ReceivedPendingStatus {
  let receivablePaise = 0
  let receivedPaise = 0
  for (const e of expenses) {
    const row = getExpenseSettlementRow(e, travellers)
    if (!row) continue
    receivablePaise += toPaise(row.totalReceivable)
    receivedPaise += toPaise(row.receivedAmount)
  }
  return {
    totalReceivable: toRupees(receivablePaise),
    totalReceived: toRupees(receivedPaise),
    totalPending: toRupees(receivablePaise - receivedPaise),
  }
}
