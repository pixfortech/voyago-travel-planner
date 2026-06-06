'use client'

import { formatCurrency, expenseCategoryIcon } from '@/lib/utils'
import type { Expense, ExpenseCategory } from '@/types'

interface BudgetOverviewProps {
  budget: number
  currency: string
  expenses: Expense[]
}

const CATEGORIES: ExpenseCategory[] = [
  'accommodation',
  'transport',
  'food',
  'activities',
  'shopping',
  'other',
]

export default function BudgetOverview({ budget, currency, expenses }: BudgetOverviewProps) {
  const spent = expenses.reduce((s, e) => s + e.amount, 0)
  const remaining = budget - spent
  const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0
  const over = spent > budget && budget > 0

  const byCategory = CATEGORIES.map((cat) => ({
    cat,
    total: expenses.filter((e) => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).filter((c) => c.total > 0)

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Spent</p>
            <p className={`text-2xl font-black ${over ? 'text-red-500' : 'text-gray-900'}`}>
              {formatCurrency(spent, currency)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Budget</p>
            <p className="text-2xl font-black text-gray-900">{formatCurrency(budget, currency)}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${over ? 'bg-red-400' : 'bg-primary-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex justify-between mt-2">
          <span className="text-xs text-gray-400">{pct.toFixed(0)}% used</span>
          <span className={`text-xs font-semibold ${over ? 'text-red-500' : 'text-primary-600'}`}>
            {over ? 'Over by ' : 'Remaining: '}
            {formatCurrency(Math.abs(remaining), currency)}
          </span>
        </div>
      </div>

      {/* Category breakdown */}
      {byCategory.length > 0 && (
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="text-sm font-bold text-gray-700 mb-3">By Category</p>
          <div className="space-y-2.5">
            {byCategory.map(({ cat, total }) => (
              <div key={cat} className="flex items-center gap-3">
                <span className="text-lg">{expenseCategoryIcon(cat)}</span>
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700 capitalize">{cat}</span>
                    <span className="text-xs font-semibold text-gray-900">
                      {formatCurrency(total, currency)}
                    </span>
                  </div>
                  {budget > 0 && (
                    <div className="h-1.5 bg-gray-100 rounded-full">
                      <div
                        className="h-full bg-primary-400 rounded-full"
                        style={{ width: `${Math.min((total / budget) * 100, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
