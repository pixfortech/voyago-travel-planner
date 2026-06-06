'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import {
  expenseCategoryIcon,
  vendorTypeIcon,
  vendorTypeLabel,
  formatCurrencyPrecise,
} from '@/lib/utils'
import { toPaise, toRupees, splitPaise } from '@/lib/calculations'
import type { ExpenseCategory, Expense, Traveller, VendorType } from '@/types'

const CATEGORIES: ExpenseCategory[] = [
  'accommodation',
  'transport',
  'food',
  'activities',
  'shopping',
  'other',
]

const VENDOR_TYPES: VendorType[] = [
  'restaurant',
  'hotel',
  'transport',
  'tickets',
  'shopping',
  'emergency',
  'miscellaneous',
]

interface AddExpenseModalProps {
  open: boolean
  tripStartDate: string
  currency: string
  travellers?: Traveller[]
  onClose: () => void
  onAdd: (expense: Omit<Expense, 'id' | 'tripId' | 'createdAt'>) => Promise<void>
}

export default function AddExpenseModal({
  open,
  tripStartDate,
  currency,
  travellers,
  onClose,
  onAdd,
}: AddExpenseModalProps) {
  const allTravellers = travellers ?? []
  const hasTravellers = allTravellers.length > 0

  const [category, setCategory] = useState<ExpenseCategory>('food')
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(tripStartDate)
  const [notes, setNotes] = useState('')
  // Default to first traveller so group expenses are tracked by default.
  const [paidByTravellerId, setPaidByTravellerId] = useState(allTravellers[0]?.id ?? '')
  const [participantIds, setParticipantIds] = useState<string[]>(
    allTravellers.map((t) => t.id)
  )
  const [vendorName, setVendorName] = useState('')
  const [vendorType, setVendorType] = useState<VendorType | ''>('')
  const [locationName, setLocationName] = useState('')
  const [showMore, setShowMore] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function reset() {
    setCategory('food')
    setTitle('')
    setAmount('')
    setDate(tripStartDate)
    setNotes('')
    setPaidByTravellerId(allTravellers[0]?.id ?? '')
    setParticipantIds(allTravellers.map((t) => t.id))
    setVendorName('')
    setVendorType('')
    setLocationName('')
    setShowMore(false)
    setError('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  function toggleParticipant(id: string) {
    setParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    )
  }

  // ── Live preview calculations (paise-based, deterministic) ──────────────
  const amountNum = parseFloat(amount) || 0
  const splitCount = hasTravellers ? participantIds.length : 0
  const sharesPaise = splitCount > 0 ? splitPaise(toPaise(amountNum), splitCount) : []

  // perHead uses splitPaise[0] — for equal splits all shares are within 1 paisa
  // of each other, so showing sharesPaise[0] is representative
  const perHead = sharesPaise.length > 0 ? toRupees(sharesPaise[0]) : 0

  const payerIdx = participantIds.indexOf(paidByTravellerId)
  const payerInSplit = payerIdx >= 0
  const payerSharePaise = payerInSplit ? (sharesPaise[payerIdx] ?? 0) : 0
  const payerOwnShare = toRupees(payerSharePaise)
  const receivablePaise = paidByTravellerId ? toPaise(amountNum) - payerSharePaise : 0
  const receivable = toRupees(receivablePaise)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    if (!amount || amountNum <= 0) { setError('Please enter a valid amount'); return }
    if (hasTravellers && participantIds.length === 0) {
      setError('Select at least one traveller to split among')
      return
    }
    setSaving(true)

    // Build a clean Firestore-safe payload (no undefined values).
    const payload: Omit<Expense, 'id' | 'tripId' | 'createdAt'> = {
      category,
      title: title.trim(),
      amount: amountNum,
      date,
      notes: notes.trim(),
    }

    if (hasTravellers) {
      payload.splitType = 'equal'
      payload.participants = participantIds
      const paidBy = allTravellers.find((t) => t.id === paidByTravellerId)
      if (paidBy) {
        payload.paidByTravellerId = paidBy.id
        payload.paidByName = paidBy.name
      }
    }
    if (vendorName.trim()) payload.vendorName = vendorName.trim()
    if (vendorType) payload.vendorType = vendorType
    if (locationName.trim()) payload.locationName = locationName.trim()

    await onAdd(payload)
    setSaving(false)
    reset()
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Expense">
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ── Category ── */}
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

        {/* ── Title & Amount ── */}
        <Input
          label="Title"
          placeholder="e.g. Dinner at dhaba"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setError('') }}
          error={error && !title.trim() ? error : ''}
          autoFocus
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Amount"
            type="number"
            placeholder="0"
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

        {/* ── Paid by — prominent colourful chip selector ── */}
        {hasTravellers && (
          <div className="bg-gray-50 rounded-2xl p-3.5">
            <p className="text-sm font-bold text-gray-800 mb-3">
              Who paid?
              <span className="ml-2 text-[11px] font-normal text-gray-400">
                (required for split tracking)
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {allTravellers.map((t, i) => {
                const selected = paidByTravellerId === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setPaidByTravellerId(t.id)}
                    className={`flex items-center gap-1.5 pl-1 pr-3 py-1.5 rounded-full text-sm font-semibold border-2 transition-all ${
                      selected
                        ? 'text-white border-transparent shadow-md'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                    style={selected ? { background: t.color, borderColor: t.color } : undefined}
                  >
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                      style={{ background: selected ? 'rgba(255,255,255,0.3)' : t.color }}
                    >
                      {t.initials || `T${i + 1}`}
                    </span>
                    {t.name || `Person ${i + 1}`}
                  </button>
                )
              })}
              {/* "Not tracked" as a de-emphasised secondary option */}
              <button
                type="button"
                onClick={() => setPaidByTravellerId('')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all ${
                  paidByTravellerId === ''
                    ? 'bg-gray-700 text-white border-gray-700'
                    : 'bg-white text-gray-400 border-dashed border-gray-300 hover:border-gray-400'
                }`}
              >
                Not tracked
              </button>
            </div>
          </div>
        )}

        {/* ── Split among ── */}
        {hasTravellers && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">
                Split among
                <span className="ml-1.5 text-xs font-normal text-gray-400">
                  ({participantIds.length} of {allTravellers.length})
                </span>
              </p>
              <button
                type="button"
                onClick={() =>
                  setParticipantIds(
                    participantIds.length === allTravellers.length
                      ? []
                      : allTravellers.map((t) => t.id)
                  )
                }
                className="text-xs font-semibold text-primary-600 hover:text-primary-700"
              >
                {participantIds.length === allTravellers.length ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {allTravellers.map((t, i) => {
                const selected = participantIds.includes(t.id)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleParticipant(t.id)}
                    className={`flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                      selected
                        ? 'bg-primary-50 text-primary-700 border-primary-300'
                        : 'bg-gray-50 text-gray-400 border-gray-200 line-through'
                    }`}
                  >
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white"
                      style={{ background: selected ? t.color : '#cbd5e1' }}
                    >
                      {t.initials || `T${i + 1}`}
                    </span>
                    {t.name || `Person ${i + 1}`}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Live split preview ── */}
        {hasTravellers && amountNum > 0 && participantIds.length > 0 && (
          <div className="rounded-2xl overflow-hidden border border-primary-100">
            <div className="bg-gradient-to-br from-primary-500 to-teal-500 px-4 py-2.5">
              <p className="text-xs font-bold text-white/80 uppercase tracking-wide">
                Split preview
              </p>
            </div>
            <div className="bg-gradient-to-br from-primary-50 to-teal-50 px-4 py-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] text-primary-400 font-bold uppercase tracking-wide mb-0.5">
                    Per head ({participantIds.length})
                  </p>
                  <p className="text-lg font-black text-primary-700">
                    {formatCurrencyPrecise(perHead, currency)}
                  </p>
                </div>
                {paidByTravellerId ? (
                  <>
                    <div>
                      <p className="text-[10px] text-primary-400 font-bold uppercase tracking-wide mb-0.5">
                        Payer's share
                      </p>
                      <p className="text-lg font-black text-gray-700">
                        {formatCurrencyPrecise(payerOwnShare, currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-green-500 font-bold uppercase tracking-wide mb-0.5">
                        Payer receives
                      </p>
                      <p className="text-lg font-black text-green-600">
                        {formatCurrencyPrecise(receivable, currency)}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="col-span-2 flex items-center">
                    <p className="text-xs text-primary-400 italic">
                      Select a payer to see receivable amount
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Optional: vendor + location ── */}
        <div>
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors mb-2"
          >
            {showMore ? '▲ Hide extra details' : '▼ Add vendor / location (optional)'}
          </button>
          {showMore && (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Vendor name"
                  placeholder="e.g. Café Mondegar"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Vendor type
                  </label>
                  <select
                    value={vendorType}
                    onChange={(e) => setVendorType(e.target.value as VendorType | '')}
                    className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
                  >
                    <option value="">—</option>
                    {VENDOR_TYPES.map((v) => (
                      <option key={v} value={v}>
                        {vendorTypeIcon(v)} {vendorTypeLabel(v)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <Input
                label="Location / place"
                placeholder="e.g. Colaba, Mumbai"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
              />
            </div>
          )}
        </div>

        <Input
          label="Notes (optional)"
          placeholder="Receipt number, booking ref…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

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
