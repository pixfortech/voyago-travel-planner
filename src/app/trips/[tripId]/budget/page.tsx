'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import {
  getTrip,
  getExpenses,
  getItineraryDays,
  addExpense,
  deleteExpense,
  updateExpense,
} from '@/lib/firestore'
import AppShell from '@/components/layout/AppShell'
import BudgetOverview from '@/components/budget/BudgetOverview'
import TravellerLedger from '@/components/budget/TravellerLedger'
import ExpenseCard from '@/components/budget/ExpenseCard'
import AddExpenseModal from '@/components/budget/AddExpenseModal'
import BudgetCoachCard from '@/components/ai/BudgetCoachCard'
import Button from '@/components/ui/Button'
import type { Trip, Expense, ItineraryDay } from '@/types'

export default function BudgetPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const router = useRouter()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [days, setDays] = useState<ItineraryDay[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    if (!tripId) return
    Promise.all([getTrip(tripId), getExpenses(tripId), getItineraryDays(tripId)]).then(
      ([t, e, d]) => {
        if (!t) { router.push('/dashboard'); return }
        setTrip(t)
        setExpenses(e)
        setDays(d)
        setLoading(false)
      }
    )
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

  // Toggle one participant's "received" status — optimistic update + persist.
  async function handleToggleReceived(expense: Expense, travellerId: string) {
    const settled = new Set(expense.settledParticipantIds ?? [])
    if (settled.has(travellerId)) settled.delete(travellerId)
    else settled.add(travellerId)
    const settledParticipantIds = Array.from(settled)
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
  const showLedger = travellers.length > 1 && trackedExpenses.length > 0

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

        {/* ── Analytics overview ── */}
        <BudgetOverview
          budget={trip.budget}
          currency={trip.currency}
          expenses={expenses}
          travellerCount={travellerCount}
        />

        {/* ── AI Budget Coach ── */}
        <div id="ai-coach" className="scroll-mt-24">
          <BudgetCoachCard trip={trip} expenses={expenses} days={days} variant="budget" />
        </div>

        {/* ── Traveller ledger (only when tracked expenses exist) ── */}
        {showLedger && (
          <TravellerLedger
            expenses={trackedExpenses}
            travellers={travellers}
            currency={trip.currency}
          />
        )}

        {/* ── Expense list ── */}
        {expenses.length > 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <p className="text-sm font-bold text-gray-700">
                Expenses
                <span className="ml-1.5 text-xs font-normal text-gray-400">
                  ({expenses.length})
                </span>
              </p>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors"
              >
                + Add
              </button>
            </div>
            {expenses.map((expense) => (
              <ExpenseCard
                key={expense.id}
                expense={expense}
                travellers={travellers}
                currency={trip.currency}
                onToggleReceived={handleToggleReceived}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
            {travellers.length > 1 ? (
              <>
                <p className="text-3xl mb-3">💸</p>
                <p className="text-sm font-semibold text-gray-700 mb-1">No expenses yet</p>
                <p className="text-xs text-gray-400 mb-5 max-w-xs mx-auto leading-relaxed">
                  Add an expense and choose who paid — Voyago will calculate splits and track
                  how much each person owes the payer.
                </p>
              </>
            ) : (
              <>
                <p className="text-3xl mb-3">💰</p>
                <p className="text-sm font-semibold text-gray-700 mb-1">No expenses yet</p>
                <p className="text-xs text-gray-400 mb-5">Start tracking your trip spending.</p>
              </>
            )}
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
