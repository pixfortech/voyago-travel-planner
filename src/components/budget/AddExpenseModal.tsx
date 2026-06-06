'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { expenseCategoryIcon } from '@/lib/utils'
import type { ExpenseCategory, Expense } from '@/types'

const CATEGORIES: ExpenseCategory[] = [
  'accommodation',
  'transport',
  'food',
  'activities',
  'shopping',
  'other',
]

interface AddExpenseModalProps {
  open: boolean
  tripStartDate: string
  onClose: () => void
  onAdd: (expense: Omit<Expense, 'id' | 'tripId' | 'createdAt'>) => Promise<void>
}

export default function AddExpenseModal({
  open,
  tripStartDate,
  onClose,
  onAdd,
}: AddExpenseModalProps) {
  const [category, setCategory] = useState<ExpenseCategory>('food')
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(tripStartDate)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function reset() {
    setCategory('food')
    setTitle('')
    setAmount('')
    setDate(tripStartDate)
    setNotes('')
    setError('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    if (!amount || parseFloat(amount) <= 0) { setError('Please enter a valid amount'); return }
    setSaving(true)
    await onAdd({ category, title: title.trim(), amount: parseFloat(amount), date, notes: notes.trim() })
    setSaving(false)
    reset()
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Expense">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Category</p>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-medium transition-all ${
                  category === c
                    ? 'bg-primary-500 text-white border-primary-500'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-base">{expenseCategoryIcon(c)}</span>
                <span className="capitalize">{c}</span>
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Title"
          placeholder="e.g. Dinner at Nobu"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setError('') }}
          error={error && !amount ? error : title ? '' : error}
          autoFocus
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Amount"
            type="number"
            placeholder="0.00"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setError('') }}
          />
          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <Input
          label="Notes (optional)"
          placeholder="Receipt, ref…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={saving}>
            {saving ? 'Adding…' : 'Add Expense'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
