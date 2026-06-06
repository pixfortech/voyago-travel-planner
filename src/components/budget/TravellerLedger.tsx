'use client'

import { formatCurrency } from '@/lib/utils'
import {
  getTravellerBalances,
  getSettlementSummary,
} from '@/lib/calculations'
import type { Expense, Traveller } from '@/types'
import { ArrowRight } from 'lucide-react'

interface TravellerLedgerProps {
  expenses: Expense[]
  travellers: Traveller[]
  currency: string
}

export default function TravellerLedger({
  expenses,
  travellers,
  currency,
}: TravellerLedgerProps) {
  const balances = getTravellerBalances(expenses, travellers)
  const settlements = getSettlementSummary(balances)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50">
        <p className="text-sm font-bold text-gray-700">Traveller Ledger</p>
        <p className="text-xs text-gray-400 mt-0.5">Who paid, who owes — net per person</p>
      </div>

      {/* Per-traveller rows */}
      <div className="divide-y divide-gray-50">
        {balances.map((b) => (
          <div key={b.travellerId} className="flex items-center gap-3 px-4 py-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0"
              style={{ background: b.color }}
              title={`${b.name} · ${b.travellerId.slice(0, 4)}`}
            >
              {b.initials || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{b.name}</p>
              <p className="text-[11px] text-gray-400">
                Paid {formatCurrency(b.totalPaid, currency)} · Share{' '}
                {formatCurrency(b.totalShare, currency)}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              {b.net > 0 ? (
                <>
                  <p className="text-sm font-black text-green-600">
                    +{formatCurrency(b.toReceive, currency)}
                  </p>
                  <p className="text-[10px] text-green-500/80 font-semibold uppercase tracking-wide">
                    to receive
                  </p>
                </>
              ) : b.net < 0 ? (
                <>
                  <p className="text-sm font-black text-orange-500">
                    −{formatCurrency(b.toPay, currency)}
                  </p>
                  <p className="text-[10px] text-orange-400 font-semibold uppercase tracking-wide">
                    to pay
                  </p>
                </>
              ) : (
                <p className="text-sm font-bold text-gray-400">settled</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Suggested settle-up */}
      {settlements.length > 0 && (
        <div className="border-t border-gray-50 bg-gray-50/60">
          <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">
            Suggested settle-up
          </p>
          <div className="divide-y divide-gray-100">
            {settlements.map((s, i) => (
              <div key={i} className="flex items-center gap-2 px-4 py-2.5">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-black flex-shrink-0"
                  style={{ background: s.fromColor }}
                >
                  {travellers.find((t) => t.id === s.from)?.initials || '?'}
                </div>
                <span className="text-xs font-semibold text-gray-700 truncate max-w-[5rem]">
                  {s.fromName}
                </span>
                <ArrowRight size={12} className="text-gray-300 flex-shrink-0" />
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-black flex-shrink-0"
                  style={{ background: s.toColor }}
                >
                  {travellers.find((t) => t.id === s.to)?.initials || '?'}
                </div>
                <span className="text-xs font-semibold text-gray-700 truncate max-w-[5rem]">
                  {s.toName}
                </span>
                <span className="ml-auto text-xs font-bold text-gray-900 flex-shrink-0">
                  {formatCurrency(s.amount, currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
