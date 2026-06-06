'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Plus, Trash2, MapPin } from 'lucide-react'
import {
  getTrip,
  getExpenses,
  addExpense,
  deleteExpense,
  updateExpense,
} from '@/lib/firestore'
import AppShell from '@/components/layout/AppShell'
import BudgetOverview from '@/components/budget/BudgetOverview'
import TravellerLedger from '@/components/budget/TravellerLedger'
import SettlementTracker from '@/components/budget/SettlementTracker'
import AddExpenseModal from '@/components/budget/AddExpenseModal'
import Button from '@/components/ui/Button'
import {
  formatDate,
  formatCurrency,
  formatCurrencyPrecise,
  expenseCategoryIcon,
  vendorTypeLabel,
} from '@/lib/utils'
import { getExpenseSharesPaise, toRupees } from '@/lib/calculations'
import type { Trip, Expense } from '@/types'

export default function BudgetPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const router = useRouter()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    if (!tripId) return
    Promise.all([getTrip(tripId), getExpenses(tripId)]).then(([t, e]) => {
      if (!t) { router.push('/dashboard'); return }
      setTrip(t)
      setExpenses(e)
      setLoading(false)
    })
  }, [tripId, router])

  async function handleAddExpense(data: Omit<Expense, 'id' | 'tripId' | 'createdAt'>) {
    const id = await addExpense(tripId, data)
    setExpenses((prev) => [
      { ...data, id, tripId, createdAt: new Date().toISOString() },
      ...prev,
    ])
  }

  async function handleDelete(expenseId: string) {
    await deleteExpense(tripId, expenseId)
    setExpenses((prev) => prev.filter((e) => e.id !== expenseId))
  }

  // Toggle one participant's "received" status on a tracked expense.
  async function handleToggleReceived(expense: Expense, travellerId: string) {
    const settled = new Set(expense.settledParticipantIds ?? [])
    if (settled.has(travellerId)) settled.delete(travellerId)
    else settled.add(travellerId)
    const settledParticipantIds = Array.from(settled)

    // Optimistic local update, then persist.
    setExpenses((prev) =>
      prev.map((e) => (e.id === expense.id ? { ...e, settledParticipantIds } : e))
    )
    await updateExpense(tripId, expense.id, { settledParticipantIds })
  }

  if (loading) {
    return (
      <AppShell title="Budget" back={`/trips/${tripId}`} tripId={tripId}>
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (!trip) return null

  const travellers = trip.travellers ?? []
  const travellerCount = Math.max(travellers.length, 1)
  const trackedExpenses = expenses.filter((e) => e.paidByTravellerId)
  const showGroup = travellers.length > 1 && trackedExpenses.length > 0

  return (
    <AppShell
      title="Budget"
      back={`/trips/${tripId}`}
      tripId={tripId}
      actions={
        <Button size="sm" onClick={() => setModalOpen(true)}>
          <Plus size={16} /> Add
        </Button>
      }
    >
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <BudgetOverview
          budget={trip.budget}
          currency={trip.currency}
          expenses={expenses}
          travellerCount={travellerCount}
        />

        {showGroup && (
          <>
            <TravellerLedger
              expenses={trackedExpenses}
              travellers={travellers}
              currency={trip.currency}
            />
            <SettlementTracker
              expenses={trackedExpenses}
              travellers={travellers}
              currency={trip.currency}
              onToggleReceived={handleToggleReceived}
            />
          </>
        )}

        {/* Expense list */}
        {expenses.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-sm font-bold text-gray-700">All Expenses</p>
            </div>
            <div className="divide-y divide-gray-50">
              {expenses.map((expense) => {
                const shareValues = Array.from(
                  getExpenseSharesPaise(expense, travellers).values()
                )
                const splitCount = shareValues.length
                const perHead = splitCount > 0 ? toRupees(shareValues[0]) : 0
                return (
                  <div
                    key={expense.id}
                    className="flex items-center gap-3 px-4 py-3 group hover:bg-gray-50"
                  >
                    <span className="text-xl flex-shrink-0">
                      {expenseCategoryIcon(expense.category)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {expense.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-xs text-gray-400 capitalize">
                          {expense.category}
                        </span>
                        <span className="text-gray-200">·</span>
                        <span className="text-xs text-gray-400">{formatDate(expense.date)}</span>
                        {expense.vendorType && (
                          <>
                            <span className="text-gray-200">·</span>
                            <span className="text-xs text-gray-400">
                              {vendorTypeLabel(expense.vendorType)}
                            </span>
                          </>
                        )}
                        {expense.locationName && (
                          <>
                            <span className="text-gray-200">·</span>
                            <span className="inline-flex items-center gap-0.5 text-xs text-gray-400">
                              <MapPin size={10} /> {expense.locationName}
                            </span>
                          </>
                        )}
                      </div>
                      {expense.paidByName && travellers.length > 1 && (
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[11px] text-primary-500 font-medium">
                            {expense.paidByName} paid
                          </span>
                          <span className="text-gray-200">·</span>
                          <span className="text-[11px] text-gray-400">
                            split {splitCount} · {formatCurrencyPrecise(perHead, trip.currency)}/head
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-bold text-gray-900">
                        {formatCurrency(expense.amount, trip.currency)}
                      </span>
                      <button
                        onClick={() => handleDelete(expense.id)}
                        className="p-1.5 rounded-lg text-gray-300 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:text-red-400 hover:bg-red-50 transition-all"
                        aria-label="Delete expense"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {expenses.length === 0 && (
          <div className="text-center py-10">
            <p className="text-gray-400 text-sm mb-4">No expenses recorded yet.</p>
            <Button onClick={() => setModalOpen(true)}>
              <Plus size={16} /> Add First Expense
            </Button>
          </div>
        )}
      </motion.div>

      <AddExpenseModal
        open={modalOpen}
        tripStartDate={trip.startDate}
        currency={trip.currency}
        travellers={travellers.length > 0 ? travellers : undefined}
        onClose={() => setModalOpen(false)}
        onAdd={handleAddExpense}
      />
    </AppShell>
  )
}
