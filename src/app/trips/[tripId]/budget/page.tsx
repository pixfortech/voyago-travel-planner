'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X } from 'lucide-react'
import {
  getTrip,
  getExpenses,
  getItineraryDays,
  addExpense,
  deleteExpense,
  updateExpense,
} from '@/lib/firestore'
import { useApp } from '@/context/AppContext'
import AppShell from '@/components/layout/AppShell'
import BudgetOverview from '@/components/budget/BudgetOverview'
import TravellerLedger from '@/components/budget/TravellerLedger'
import ExpenseCard from '@/components/budget/ExpenseCard'
import AddExpenseModal from '@/components/budget/AddExpenseModal'
import BillUploadModal from '@/components/budget/BillUploadModal'
import BudgetCoachCard from '@/components/ai/BudgetCoachCard'
import CommentsPanel from '@/components/comments/CommentsPanel'
import Button from '@/components/ui/Button'
import { deleteBillImage } from '@/lib/bills/storage'
import type { Trip, Expense, ItineraryDay } from '@/types'

export default function BudgetPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const router = useRouter()
  const { user, profile } = useApp()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [days, setDays] = useState<ItineraryDay[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [commentTarget, setCommentTarget] = useState<{ expenseId: string; expenseTitle: string } | null>(null)
  const [billTarget, setBillTarget] = useState<Expense | null>(null)

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
    // Best-effort clean-up of any attached bill image before deleting the expense.
    const target = expenses.find((e) => e.id === expenseId)
    if (target?.billStoragePath) {
      await deleteBillImage(target.billStoragePath)
    }
    await deleteExpense(tripId, expenseId)
    setExpenses((prev) => prev.filter((e) => e.id !== expenseId))
  }

  // Persist confirmed bill + expense field changes from the BillUploadModal.
  async function handleConfirmBill(expenseId: string, updates: Partial<Expense>) {
    await updateExpense(tripId, expenseId, updates)
    setExpenses((prev) => prev.map((e) => (e.id === expenseId ? { ...e, ...updates } : e)))
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
                onCommentsClick={
                  user && !user.isAnonymous
                    ? (id, title) => setCommentTarget({ expenseId: id, expenseTitle: title })
                    : undefined
                }
                onBillClick={
                  user && !user.isAnonymous ? (exp) => setBillTarget(exp) : undefined
                }
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

      {/* ── Bill upload + spend analysis ── */}
      {billTarget && (
        <BillUploadModal
          open={!!billTarget}
          trip={trip}
          expense={billTarget}
          onClose={() => setBillTarget(null)}
          onConfirm={(updates) => handleConfirmBill(billTarget.id, updates)}
        />
      )}

      {/* ── Expense discussion drawer ── */}
      <AnimatePresence>
        {commentTarget && user && !user.isAnonymous && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex justify-end"
            onClick={() => setCommentTarget(null)}
          >
            <div className="flex-1 bg-black/40" />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="w-full max-w-sm bg-white flex flex-col h-full shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 flex-shrink-0">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-gray-400 uppercase tracking-wide">Discussion</p>
                  <p className="text-sm font-bold text-gray-900 truncate">{commentTarget.expenseTitle}</p>
                </div>
                <button
                  onClick={() => setCommentTarget(null)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3">
                <CommentsPanel
                  tripId={tripId}
                  targetType="expense"
                  targetId={commentTarget.expenseId}
                  trip={trip}
                  currentUid={user.uid}
                  authorName={profile?.name ?? user.displayName ?? 'Member'}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  )
}
