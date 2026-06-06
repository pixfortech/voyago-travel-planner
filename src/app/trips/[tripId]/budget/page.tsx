'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Plus, Trash2, ArrowRight } from 'lucide-react'
import { getTrip, getExpenses, addExpense, deleteExpense } from '@/lib/firestore'
import AppShell from '@/components/layout/AppShell'
import BudgetOverview from '@/components/budget/BudgetOverview'
import AddExpenseModal from '@/components/budget/AddExpenseModal'
import Button from '@/components/ui/Button'
import { formatDate, formatCurrency, expenseCategoryIcon } from '@/lib/utils'
import { getTravellerBalances, getSettlementSummary } from '@/lib/calculations'
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
  const trackedExpenses = expenses.filter((e) => e.paidByTravellerId)
  const showSettlement = travellers.length > 1 && trackedExpenses.length > 0
  const balances = showSettlement ? getTravellerBalances(trackedExpenses, travellers) : []
  const settlements = showSettlement ? getSettlementSummary(balances) : []

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
        <BudgetOverview budget={trip.budget} currency={trip.currency} expenses={expenses} />

        {/* Settlement summary */}
        {showSettlement && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-sm font-bold text-gray-700">Settlement</p>
              <p className="text-xs text-gray-400 mt-0.5">Based on {trackedExpenses.length} tracked expense{trackedExpenses.length !== 1 ? 's' : ''}</p>
            </div>

            {/* Balances */}
            <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-2 border-b border-gray-50">
              {balances.map((b) => (
                <div key={b.travellerId} className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                    style={{ background: b.color }}
                  >
                    {travellers.find((t) => t.id === b.travellerId)?.initials || '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-900 truncate">{b.name}</p>
                    <p
                      className={`text-xs font-bold ${b.net >= 0 ? 'text-green-600' : 'text-red-500'}`}
                    >
                      {b.net >= 0 ? '+' : ''}
                      {formatCurrency(b.net, trip.currency)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Who pays whom */}
            {settlements.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {settlements.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 px-4 py-2.5">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-black flex-shrink-0"
                      style={{ background: s.fromColor }}
                    >
                      {travellers.find((t) => t.id === s.from)?.initials || '?'}
                    </div>
                    <span className="text-xs font-semibold text-gray-700 truncate max-w-[5rem]">{s.fromName}</span>
                    <ArrowRight size={12} className="text-gray-300 flex-shrink-0" />
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-black flex-shrink-0"
                      style={{ background: s.toColor }}
                    >
                      {travellers.find((t) => t.id === s.to)?.initials || '?'}
                    </div>
                    <span className="text-xs font-semibold text-gray-700 truncate max-w-[5rem]">{s.toName}</span>
                    <span className="ml-auto text-xs font-bold text-gray-900 flex-shrink-0">
                      {formatCurrency(s.amount, trip.currency)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-4 py-3 text-xs text-gray-400">All square — no settlements needed.</p>
            )}
          </div>
        )}

        {/* Expense list */}
        {expenses.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-sm font-bold text-gray-700">All Expenses</p>
            </div>
            <div className="divide-y divide-gray-50">
              {expenses.map((expense) => (
                <div
                  key={expense.id}
                  className="flex items-center gap-3 px-4 py-3 group hover:bg-gray-50"
                >
                  <span className="text-xl flex-shrink-0">{expenseCategoryIcon(expense.category)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{expense.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-gray-400 capitalize">{expense.category}</span>
                      <span className="text-gray-200">·</span>
                      <span className="text-xs text-gray-400">{formatDate(expense.date)}</span>
                      {expense.paidByName && (
                        <>
                          <span className="text-gray-200">·</span>
                          <span className="text-xs text-primary-500 font-medium">
                            {expense.paidByName}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-bold text-gray-900">
                      {formatCurrency(expense.amount, trip.currency)}
                    </span>
                    <button
                      onClick={() => handleDelete(expense.id)}
                      className="p-1.5 rounded-lg text-gray-300 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:text-red-400 hover:bg-red-50 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
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
        travellers={travellers.length > 0 ? travellers : undefined}
        onClose={() => setModalOpen(false)}
        onAdd={handleAddExpense}
      />
    </AppShell>
  )
}
