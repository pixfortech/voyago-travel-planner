'use client'

import { motion } from 'framer-motion'
import {
  formatCurrency,
  formatCurrencyPrecise,
  formatShortDate,
  expenseCategoryIcon,
  vendorTypeIcon,
  vendorTypeLabel,
} from '@/lib/utils'
import {
  getTotalSpent,
  getRemainingBudget,
  getBudgetUsagePercent,
  getPerHeadBudget,
  getPerHeadActualCost,
  getCategoryTotals,
  getVendorTypeTotals,
  getDayWiseTotals,
} from '@/lib/calculations'
import type { Expense } from '@/types'

interface BudgetOverviewProps {
  budget: number
  currency: string
  expenses: Expense[]
  travellerCount: number
}

export default function BudgetOverview({
  budget,
  currency,
  expenses,
  travellerCount,
}: BudgetOverviewProps) {
  const spent = getTotalSpent(expenses)
  const remaining = getRemainingBudget(budget, expenses)
  const pct = getBudgetUsagePercent(budget, expenses)
  const over = budget > 0 && spent > budget

  const perHeadBudget = getPerHeadBudget(budget, travellerCount)
  const perHeadSpent = getPerHeadActualCost(expenses, travellerCount)
  const perHeadRemaining = perHeadBudget - perHeadSpent

  const byCategory = getCategoryTotals(expenses)
  const byVendor = getVendorTypeTotals(expenses)
  const byDay = getDayWiseTotals(expenses)
  const maxDay = byDay.reduce((m, d) => Math.max(m, d.total), 0)

  // Colour-code budget usage status
  const status =
    over
      ? { bar: 'bg-red-400', text: 'text-red-500', label: 'Over budget' }
      : pct >= 80
      ? { bar: 'bg-amber-400', text: 'text-amber-500', label: 'Approaching limit' }
      : { bar: 'bg-primary-500', text: 'text-primary-600', label: 'On track' }

  return (
    <div className="space-y-4">
      {/* Headline numbers */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm"
      >
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">Budget</p>
            <p className="text-lg sm:text-xl font-black text-gray-900">
              {budget > 0 ? formatCurrency(budget, currency) : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">Spent</p>
            <p className={`text-lg sm:text-xl font-black ${over ? 'text-red-500' : 'text-gray-900'}`}>
              {formatCurrency(spent, currency)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">
              {over ? 'Over by' : 'Remaining'}
            </p>
            <p className={`text-lg sm:text-xl font-black ${over ? 'text-red-500' : 'text-green-600'}`}>
              {formatCurrency(Math.abs(remaining), currency)}
            </p>
          </div>
        </div>

        {budget > 0 && (
          <>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${status.bar}`}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(pct, 100)}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-xs text-gray-400">{pct.toFixed(0)}% used</span>
              <span className={`text-xs font-bold ${status.text}`}>{status.label}</span>
            </div>
          </>
        )}

        {over && (
          <div className="mt-3 flex items-center gap-2 bg-red-50 text-red-600 text-xs font-semibold rounded-xl px-3 py-2">
            ⚠️ You&apos;ve exceeded your budget by {formatCurrency(Math.abs(remaining), currency)}.
          </div>
        )}
      </motion.div>

      {/* Per-head stats */}
      {travellerCount > 1 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-primary-50 to-teal-50 rounded-2xl p-4">
            <p className="text-[10px] text-primary-400 font-bold uppercase tracking-wide">
              Per head spent
            </p>
            <p className="text-xl font-black text-primary-700">
              {formatCurrencyPrecise(perHeadSpent, currency)}
            </p>
            <p className="text-[11px] text-primary-400/80 mt-0.5">across {travellerCount} travellers</p>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-4">
            <p className="text-[10px] text-amber-500 font-bold uppercase tracking-wide">
              Per head {perHeadRemaining < 0 ? 'over' : 'budget left'}
            </p>
            <p className={`text-xl font-black ${perHeadRemaining < 0 ? 'text-red-500' : 'text-amber-600'}`}>
              {budget > 0 ? formatCurrencyPrecise(Math.abs(perHeadRemaining), currency) : '—'}
            </p>
            <p className="text-[11px] text-amber-500/70 mt-0.5">
              of {budget > 0 ? formatCurrencyPrecise(perHeadBudget, currency) : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Category breakdown */}
      {byCategory.length > 0 && (
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="text-sm font-bold text-gray-700 mb-3">By Category</p>
          <div className="space-y-2.5">
            {byCategory.map(({ category, total }) => (
              <div key={category} className="flex items-center gap-3">
                <span className="text-lg">{expenseCategoryIcon(category)}</span>
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700 capitalize">{category}</span>
                    <span className="text-xs font-semibold text-gray-900">
                      {formatCurrency(total, currency)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full">
                    <div
                      className="h-full bg-primary-400 rounded-full"
                      style={{ width: `${spent > 0 ? Math.min((total / spent) * 100, 100) : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vendor-type breakdown */}
      {byVendor.length > 0 && (
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="text-sm font-bold text-gray-700 mb-3">By Vendor Type</p>
          <div className="flex flex-wrap gap-2">
            {byVendor.map(({ vendorType, total }) => (
              <div
                key={vendorType}
                className="flex items-center gap-1.5 bg-gray-50 rounded-xl px-3 py-1.5"
              >
                <span className="text-sm">{vendorTypeIcon(vendorType)}</span>
                <span className="text-xs font-medium text-gray-600">
                  {vendorTypeLabel(vendorType)}
                </span>
                <span className="text-xs font-bold text-gray-900">
                  {formatCurrency(total, currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Day-wise spend */}
      {byDay.length > 1 && (
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="text-sm font-bold text-gray-700 mb-3">Day-wise Spend</p>
          <div className="space-y-2">
            {byDay.map(({ date, total }) => (
              <div key={date} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-14 flex-shrink-0">
                  {formatShortDate(date)}
                </span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full">
                  <div
                    className="h-full bg-gradient-to-r from-primary-400 to-teal-400 rounded-full"
                    style={{ width: `${maxDay > 0 ? Math.max((total / maxDay) * 100, 4) : 0}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-gray-900 w-20 text-right flex-shrink-0">
                  {formatCurrency(total, currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
