'use client'

import { useState } from 'react'
import { ChevronDown, Trash2, MapPin, Check, Package } from 'lucide-react'
import {
  formatCurrency,
  formatCurrencyPrecise,
  formatDate,
  expenseCategoryIcon,
  vendorTypeLabel,
} from '@/lib/utils'
import {
  getExpenseSettlementRow,
  getExpenseSharesPaise,
  toRupees,
  toPaise,
} from '@/lib/calculations'
import type { Expense, Traveller } from '@/types'

interface ExpenseCardProps {
  expense: Expense
  travellers: Traveller[]
  currency: string
  onToggleReceived: (expense: Expense, travellerId: string) => void
  onDelete: (expenseId: string) => void
}

const STATUS_BADGE: Record<string, string> = {
  received: 'bg-green-50 text-green-600',
  partially_received: 'bg-amber-50 text-amber-600',
  pending: 'bg-orange-50 text-orange-500',
}

const STATUS_LABEL: Record<string, string> = {
  received: 'Settled',
  partially_received: 'Partial',
  pending: 'Pending',
}

function MiniStat({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'green' | 'orange'
}) {
  const color =
    tone === 'green'
      ? 'text-green-600'
      : tone === 'orange'
      ? 'text-orange-500'
      : 'text-gray-900'
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-400 font-bold">{label}</p>
      <p className={`text-sm font-black truncate ${color}`}>{value}</p>
    </div>
  )
}

export default function ExpenseCard({
  expense,
  travellers,
  currency,
  onToggleReceived,
  onDelete,
}: ExpenseCardProps) {
  const [open, setOpen] = useState(false)

  const row = getExpenseSettlementRow(expense, travellers)
  const tracked = row !== null
  const shareValues = Array.from(getExpenseSharesPaise(expense, travellers).values())
  const splitCount = shareValues.length
  const perHead = splitCount > 0 ? toRupees(shareValues[0]) : 0
  const payerOwnShare = row
    ? toRupees(toPaise(row.amount) - toPaise(row.totalReceivable))
    : 0

  return (
    <div className="border-b border-gray-50 last:border-0">
      {/* Collapsed header — click to expand */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-xl flex-shrink-0">{expenseCategoryIcon(expense.category)}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{expense.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-xs text-gray-400 capitalize">{expense.category}</span>
            <span className="text-gray-200">·</span>
            <span className="text-xs text-gray-400">{formatDate(expense.date)}</span>
            {tracked && (
              <>
                <span className="text-gray-200">·</span>
                <span className="text-[11px] text-primary-500 font-medium">
                  {row.payerName} paid
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-sm font-bold text-gray-900">
            {formatCurrency(expense.amount, currency)}
          </span>
          {tracked ? (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[row.status]}`}
            >
              {STATUS_LABEL[row.status]}
            </span>
          ) : (
            splitCount > 1 && (
              <span className="text-[10px] text-gray-400">
                {formatCurrencyPrecise(perHead, currency)}/head
              </span>
            )
          )}
        </div>
        <ChevronDown
          size={16}
          className={`text-gray-300 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Expanded body */}
      {open && (
        <div className="px-4 pb-4 pt-1">
          {/* Settlement maths */}
          {tracked ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <MiniStat label="Total" value={formatCurrencyPrecise(row.amount, currency)} />
                <MiniStat label="Paid by" value={row.payerName || '—'} />
                <MiniStat
                  label={`Per head (${row.splitCount})`}
                  value={formatCurrencyPrecise(perHead, currency)}
                />
                <MiniStat
                  label="Payer's share"
                  value={formatCurrencyPrecise(payerOwnShare, currency)}
                />
                <MiniStat
                  label="Receivable"
                  value={formatCurrencyPrecise(row.totalReceivable, currency)}
                  tone="green"
                />
                <MiniStat
                  label="Pending"
                  value={formatCurrencyPrecise(row.pendingAmount, currency)}
                  tone="orange"
                />
              </div>

              {/* Who owes the payer — tap a row to toggle received */}
              {row.participants.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
                      Who owes {row.payerName}
                    </p>
                    <p className="text-[11px] font-semibold text-green-600">
                      Received {formatCurrencyPrecise(row.receivedAmount, currency)}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {row.participants.map((p) => (
                      <button
                        key={p.travellerId}
                        type="button"
                        onClick={() => onToggleReceived(expense, p.travellerId)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl border transition-all ${
                          p.received
                            ? 'bg-green-50 border-green-200'
                            : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                        }`}
                        title={p.received ? 'Received — tap to undo' : 'Tap to mark received'}
                      >
                        <span
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                          style={{ background: p.color }}
                        >
                          {p.received ? <Check size={13} /> : p.initials}
                        </span>
                        <span className="text-sm font-semibold text-gray-800 flex-1 text-left truncate">
                          {p.name}
                        </span>
                        <span className="text-sm font-bold text-gray-900">
                          {formatCurrencyPrecise(p.shareAmount, currency)}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                            p.received
                              ? 'bg-green-100 text-green-600'
                              : 'bg-orange-100 text-orange-500'
                          }`}
                        >
                          {p.received ? 'Received' : 'Pending'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            // Untracked expense (no payer) — show basics only
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="Total" value={formatCurrencyPrecise(expense.amount, currency)} />
              {splitCount > 1 && (
                <MiniStat
                  label={`Per head (${splitCount})`}
                  value={formatCurrencyPrecise(perHead, currency)}
                />
              )}
            </div>
          )}

          {/* Vendor / location / notes */}
          {(expense.vendorName || expense.vendorType || expense.locationName || expense.notes) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              {(expense.vendorName || expense.vendorType) && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                  <Package size={11} className="text-gray-300" />
                  {expense.vendorName}
                  {expense.vendorName && expense.vendorType ? ' · ' : ''}
                  {expense.vendorType ? vendorTypeLabel(expense.vendorType) : ''}
                </span>
              )}
              {expense.locationName && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                  <MapPin size={11} className="text-gray-300" />
                  {expense.locationName}
                </span>
              )}
            </div>
          )}
          {expense.notes && (
            <p className="mt-2 text-xs text-gray-500 leading-relaxed whitespace-pre-line">
              {expense.notes}
            </p>
          )}

          {/* Action area */}
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => onDelete(expense.id)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
