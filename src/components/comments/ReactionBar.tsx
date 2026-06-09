'use client'

import { useEffect, useState } from 'react'
import { subscribeReactions, toggleReaction } from '@/lib/comments'
import type { CommentTargetType, TripReaction } from '@/types'

const REACTIONS = ['👍', '❤️', '😂', '😮', '✅', '❓']

interface ReactionBarProps {
  tripId: string
  targetType: CommentTargetType
  targetId: string
  currentUid: string
}

export default function ReactionBar({
  tripId,
  targetType,
  targetId,
  currentUid,
}: ReactionBarProps) {
  const [reactions, setReactions] = useState<TripReaction[]>([])
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    const unsub = subscribeReactions(tripId, targetType, targetId, setReactions)
    return unsub
  }, [tripId, targetType, targetId])

  // Group reactions: emoji → { count, myReaction? }
  const grouped = REACTIONS.map((emoji) => {
    const all = reactions.filter((r) => r.emoji === emoji)
    const mine = all.find((r) => r.userId === currentUid)
    return { emoji, count: all.length, mine }
  })

  async function handleToggle(emoji: string, mine?: TripReaction) {
    if (pending) return
    setPending(emoji)
    try {
      await toggleReaction(tripId, targetType, targetId, currentUid, emoji, mine)
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {grouped.map(({ emoji, count, mine }) => (
        <button
          key={emoji}
          onClick={() => handleToggle(emoji, mine)}
          disabled={pending === emoji}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm transition-all border ${
            mine
              ? 'bg-primary-50 border-primary-200 text-primary-700 font-semibold'
              : count > 0
              ? 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
              : 'bg-transparent border-transparent text-gray-400 hover:bg-gray-50 hover:border-gray-200'
          } ${pending === emoji ? 'opacity-50' : ''}`}
          title={mine ? `Remove ${emoji} reaction` : `React with ${emoji}`}
        >
          <span>{emoji}</span>
          {count > 0 && (
            <span className="text-xs font-bold leading-none">{count}</span>
          )}
        </button>
      ))}
    </div>
  )
}
