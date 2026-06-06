'use client'

import { Check } from 'lucide-react'
import { formatCurrency, formatCurrencyPrecise } from '@/lib/utils'
import { getExpenseSettlementRow } from '@/lib/calculations'
import type { Expense, Traveller } from '@/types'

interface SettlementTrackerProps {
  expenses: Expense[]
  travellers: Traveller[]
  currency: string
  onToggleReceived: (expense: Expense, travellerId: string) => void
}

const STATUS_BADGE: Record<string, string> = {
  received: 'bg-green-50 text-green-600',
  partially_received: 'bg-amber-50 text-amber-600',
  pending: 'bg-gray-100 text-gray-500',
}

const STATUS_LABEL: Record<string, string> = {
  received: 'Settled',
  partially_received: 'Partial',
  pending: 'Pending',
}

export default function SettlementTracker({
  expenses,
  travellers,
  currency,
  onToggleReceived,
}: SettlementTrackerProps) {
  const rows = expenses
    .map((e) => ({ expense: e, row: getExpenseSettlementRow(e, travellers) }))
    .filter((r) => r.row && r.row.participants.length > 0)

  if (rows.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50">
        <p className="text-sm font-bold text-gray-700">Settlement Tracker</p>
        <p className="text-xs text-gray-400 mt-0.5">
          Tap a person to mark their share as received
        </p>
      </div>

      <div className="divide-y divide-gray-50">
        {rows.map(({ expense, row }) => {
          if (!row) return null
          return (
            <div key={row.expenseId} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{row.title}</p>
                  <p className="text-[11px] text-gray-400">
                    {row.payerName} paid {formatCurrency(row.amount, currency)} · split{' '}
                    {row.splitCount} ways · {formatCurrencyPrecise(row.perHead, currency)}/head
                  </p>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_BADGE[row.status]}`}
                >
                  {STATUS_LABEL[row.status]}
                </span>
              </div>

              {/* Owing participants — tap to toggle received */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {row.participants.map((p) => (
                  <button
                    key={p.travellerId}
                    type="button"
                    onClick={() => onToggleReceived(expense, p.travellerId)}
                    className={`flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                      p.received
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                    title={p.received ? 'Received — tap to undo' : 'Tap to mark received'}
                  >
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white relative"
                      style={{ background: p.color }}
                    >
                      {p.received ? <Check size={11} /> : p.initials}
                    </span>
                    {p.name}
                    <span className={p.received ? 'text-green-500' : 'text-gray-400'}>
                      {formatCurrencyPrecise(p.shareAmount, currency)}
                    </span>
                  </button>
                ))}
              </div>

              {/* Received / pending tallies */}
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-green-600 font-semibold">
                  Received {formatCurrency(row.receivedAmount, currency)}
                </span>
                <span className="text-gray-300">·</span>
                <span className="text-orange-500 font-semibold">
                  Pending {formatCurrency(row.pendingAmount, currency)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
