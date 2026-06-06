'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { activityTypeIcon } from '@/lib/utils'
import type { ActivityType, Activity } from '@/types'

const TYPES: ActivityType[] = ['hotel', 'transport', 'activity', 'food', 'other']

interface AddActivityModalProps {
  open: boolean
  onClose: () => void
  onAdd: (activity: Omit<Activity, 'id'>) => Promise<void>
}

export default function AddActivityModal({ open, onClose, onAdd }: AddActivityModalProps) {
  const [type, setType] = useState<ActivityType>('activity')
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')
  const [cost, setCost] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function reset() {
    setType('activity')
    setTitle('')
    setTime('')
    setCost('')
    setNotes('')
    setError('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Please enter an activity title')
      return
    }
    setSaving(true)
    await onAdd({
      type,
      title: title.trim(),
      time,
      cost: parseFloat(cost) || 0,
      notes: notes.trim(),
      confirmed: false,
    })
    setSaving(false)
    reset()
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Activity">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Type</p>
          <div className="flex gap-2 flex-wrap">
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
                  type === t
                    ? 'bg-primary-500 text-white border-primary-500'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                <span>{activityTypeIcon(t)}</span>
                <span className="capitalize">{t}</span>
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Title"
          placeholder="e.g. Check in at hotel"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setError('') }}
          error={error}
          autoFocus
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Time (optional)"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <Input
            label="Cost (optional)"
            type="number"
            placeholder="0"
            min="0"
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </div>

        <Input
          label="Notes (optional)"
          placeholder="Booking ref, address…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={saving}>
            {saving ? 'Adding…' : 'Add'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
