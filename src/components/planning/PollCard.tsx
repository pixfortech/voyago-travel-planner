'use client'

import { useState } from 'react'
import {
  Check, Lock, Trophy, Plus, X, Trash2, CheckCircle2, ChevronDown, ChevronUp,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { POLL_TYPE_META, nameInitials, colorFromUid } from './meta'
import type { TripPoll, PollOption, UserProfile } from '@/types'

interface PollCardProps {
  poll: TripPoll
  members: UserProfile[]
  currency: string
  currentUid: string
  isOwner: boolean
  onVote: (poll: TripPoll, optionId: string) => void
  onAddOption: (poll: TripPoll, label: string) => void
  onClose: (poll: TripPoll) => void
  onReopen: (poll: TripPoll) => void
  onFinalise: (poll: TripPoll, optionId: string) => void
  onDelete: (poll: TripPoll) => void
}

export default function PollCard({
  poll,
  members,
  currency,
  currentUid,
  isOwner,
  onVote,
  onAddOption,
  onClose,
  onReopen,
  onFinalise,
  onDelete,
}: PollCardProps) {
  const [newOption, setNewOption] = useState('')
  const [addingOption, setAddingOption] = useState(false)
  const [showVoters, setShowVoters] = useState(false)

  const meta = POLL_TYPE_META[poll.type]
  const totalVotes = poll.options.reduce((s, o) => s + o.votes.length, 0)
  const canManage = isOwner || poll.createdByUid === currentUid
  const isOpen = poll.status === 'open'
  const isFinalised = poll.status === 'finalised'

  const maxVotes = Math.max(1, ...poll.options.map((o) => o.votes.length))

  function memberName(uid: string): string {
    return members.find((m) => m.id === uid)?.name ?? 'Member'
  }

  function handleAddOption() {
    const label = newOption.trim()
    if (!label) return
    onAddOption(poll, label)
    setNewOption('')
    setAddingOption(false)
  }

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
      isFinalised ? 'border-emerald-200' : 'border-gray-100'
    }`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-50">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0 text-base">
              {meta.icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900">{poll.title}</p>
              {poll.description && (
                <p className="text-xs text-gray-500 mt-0.5">{poll.description}</p>
              )}
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-50 text-gray-500">
                  {meta.label}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                  isOpen ? 'bg-emerald-50 text-emerald-600'
                  : isFinalised ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-gray-100 text-gray-500'
                }`}>
                  {isFinalised ? <><Trophy size={9} /> Finalised</>
                    : isOpen ? 'Open'
                    : <><Lock size={9} /> Closed</>}
                </span>
                <span className="text-[10px] text-gray-400">
                  {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
                  {poll.allowMultipleVotes ? ' · multi' : ''}
                </span>
              </div>
            </div>
          </div>
          {canManage && (
            <button
              onClick={() => onDelete(poll)}
              className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
              aria-label="Delete poll"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Options */}
      <div className="p-4 space-y-2">
        {poll.options.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2">No options yet — add one below.</p>
        ) : (
          poll.options.map((opt: PollOption) => {
            const count = opt.votes.length
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
            const iVoted = opt.votes.includes(currentUid)
            const isWinner = isFinalised && poll.finalisedOptionId === opt.id
            const isTop = count === maxVotes && count > 0

            return (
              <div key={opt.id}>
                <button
                  onClick={() => isOpen && onVote(poll, opt.id)}
                  disabled={!isOpen}
                  className={`w-full text-left relative rounded-xl border transition-all overflow-hidden ${
                    isWinner ? 'border-emerald-300'
                    : iVoted ? 'border-primary-300'
                    : 'border-gray-200'
                  } ${isOpen ? 'hover:border-primary-300 cursor-pointer' : 'cursor-default'}`}
                >
                  {/* Percentage fill */}
                  <div
                    className={`absolute inset-y-0 left-0 transition-all ${
                      isWinner ? 'bg-emerald-50' : isTop ? 'bg-primary-50' : 'bg-gray-50'
                    }`}
                    style={{ width: `${Math.max(pct, 4)}%` }}
                  />
                  <div className="relative flex items-center gap-2 px-3 py-2.5">
                    {/* Vote indicator */}
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 border ${
                      iVoted ? 'bg-primary-500 border-primary-500 text-white'
                      : 'border-gray-300 text-transparent'
                    }`}>
                      <Check size={12} />
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-gray-800 truncate">{opt.label}</span>
                        {isWinner && <Trophy size={12} className="text-emerald-500 flex-shrink-0" />}
                      </div>
                      {(opt.placeName || opt.description || opt.estimatedCost) && (
                        <p className="text-[11px] text-gray-400 truncate">
                          {opt.placeName}
                          {opt.placeName && (opt.description || opt.estimatedCost) ? ' · ' : ''}
                          {opt.description}
                          {opt.estimatedCost ? ` · ${formatCurrency(opt.estimatedCost, currency)}` : ''}
                        </p>
                      )}
                    </div>

                    <span className="text-xs font-bold text-gray-600 flex-shrink-0">{pct}%</span>
                    <span className="text-[11px] text-gray-400 flex-shrink-0 w-8 text-right">
                      {count}
                    </span>
                  </div>
                </button>

                {/* Finalise button (manager, open/closed only) */}
                {canManage && !isFinalised && count > 0 && (
                  <button
                    onClick={() => onFinalise(poll, opt.id)}
                    className="mt-1 ml-7 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1 transition-colors"
                  >
                    <CheckCircle2 size={10} /> Finalise this option
                  </button>
                )}
              </div>
            )
          })
        )}

        {/* Add option (open polls only) */}
        {isOpen && (
          addingOption ? (
            <div className="flex gap-1.5 pt-1">
              <input
                type="text"
                value={newOption}
                onChange={(e) => setNewOption(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddOption() }}
                placeholder="New option…"
                autoFocus
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
              <button
                onClick={handleAddOption}
                className="p-1.5 rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors"
              >
                <Plus size={14} />
              </button>
              <button
                onClick={() => { setAddingOption(false); setNewOption('') }}
                className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingOption(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 border-dashed border-gray-200 text-xs text-gray-400 hover:border-primary-300 hover:text-primary-500 transition-colors"
            >
              <Plus size={13} /> Add option
            </button>
          )
        )}
      </div>

      {/* Voters + manage footer */}
      <div className="px-4 pb-3 flex items-center justify-between gap-2 flex-wrap">
        {totalVotes > 0 ? (
          <button
            onClick={() => setShowVoters((s) => !s)}
            className="text-[11px] text-gray-400 hover:text-gray-600 inline-flex items-center gap-1 transition-colors"
          >
            {showVoters ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            Who voted
          </button>
        ) : <span />}

        {canManage && (
          <div className="flex items-center gap-2">
            {isOpen && (
              <button
                onClick={() => onClose(poll)}
                className="text-[11px] font-semibold text-gray-500 hover:text-gray-700 inline-flex items-center gap-1 transition-colors"
              >
                <Lock size={11} /> Close
              </button>
            )}
            {poll.status === 'closed' && (
              <button
                onClick={() => onReopen(poll)}
                className="text-[11px] font-semibold text-primary-600 hover:text-primary-700 transition-colors"
              >
                Reopen
              </button>
            )}
          </div>
        )}
      </div>

      {/* Voter breakdown */}
      {showVoters && totalVotes > 0 && (
        <div className="px-4 pb-4 space-y-2 border-t border-gray-50 pt-3">
          {poll.options.filter((o) => o.votes.length > 0).map((opt) => (
            <div key={opt.id}>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{opt.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {opt.votes.map((uid) => (
                  <span
                    key={uid}
                    className="inline-flex items-center gap-1 rounded-full pl-0.5 pr-2 py-0.5 bg-gray-50 text-[11px] font-medium text-gray-600"
                  >
                    <span
                      className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[7px] font-black"
                      style={{ backgroundColor: colorFromUid(uid) }}
                    >
                      {nameInitials(memberName(uid))}
                    </span>
                    {memberName(uid)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
