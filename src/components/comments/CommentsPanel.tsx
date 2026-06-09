'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageSquare, Send, Pencil, Trash2, X, Check } from 'lucide-react'
import {
  subscribeComments,
  addComment,
  editComment,
  softDeleteComment,
} from '@/lib/comments'
import { createMentionNotifications } from '@/lib/notifications'
import type { CommentTargetType, Trip, TripComment } from '@/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

const PALETTE = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
]

function authorColor(uid: string, trip: Trip): string {
  const t = trip.travellers?.find((tv) => tv.userId === uid)
  if (t) return t.color
  let h = 0
  for (let i = 0; i < uid.length; i++) h = uid.charCodeAt(i) + ((h << 5) - h)
  return PALETTE[Math.abs(h) % PALETTE.length]
}

function initials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// ── Component ─────────────────────────────────────────────────────────────────

interface CommentsPanelProps {
  tripId: string
  targetType: CommentTargetType
  targetId: string
  trip: Trip
  currentUid: string
  /** Display name of the current user — stored with the comment. */
  authorName: string
  /** When true, renders in compact mode (smaller padding, fewer decorations). */
  compact?: boolean
}

export default function CommentsPanel({
  tripId,
  targetType,
  targetId,
  trip,
  currentUid,
  authorName,
  compact = false,
}: CommentsPanelProps) {
  const [comments, setComments] = useState<TripComment[]>([])
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const color = authorColor(currentUid, trip)
  const travellers = trip.travellers ?? []

  useEffect(() => {
    const unsub = subscribeComments(tripId, targetType, targetId, (c) => {
      setComments(c)
    })
    return unsub
  }, [tripId, targetType, targetId])

  // Scroll to bottom when new comments arrive
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [comments.length])

  async function handleSubmit() {
    const text = body.trim()
    if (!text || submitting) return
    setSubmitting(true)
    try {
      const now = new Date().toISOString()
      const data: Omit<TripComment, 'id'> = {
        tripId,
        targetType,
        targetId,
        authorUid: currentUid,
        authorName,
        authorColor: color,
        body: text,
        mentions: [],
        createdAt: now,
      }
      const commentId = await addComment(tripId, data)
      setBody('')
      // Best-effort mention notifications
      createMentionNotifications({
        comment: { ...data, id: commentId },
        trip,
        travellers,
        authorName,
      }).catch(() => {})
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(c: TripComment) {
    setEditingId(c.id)
    setEditBody(c.body)
  }

  async function saveEdit() {
    if (!editingId || !editBody.trim()) return
    await editComment(tripId, editingId, editBody.trim())
    setEditingId(null)
    setEditBody('')
  }

  async function handleDelete(c: TripComment) {
    if (!confirm('Delete this comment?')) return
    await softDeleteComment(tripId, c.id)
  }

  const isOwner = trip.ownerId === currentUid

  return (
    <div className={`flex flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
      {/* Comments list */}
      <div
        ref={listRef}
        className={`overflow-y-auto space-y-3 ${compact ? 'max-h-48' : 'max-h-72'}`}
      >
        {comments.length === 0 ? (
          <div className="text-center py-6 text-gray-400">
            <MessageSquare size={22} className="mx-auto mb-1.5 opacity-40" />
            <p className="text-xs font-medium">Start the discussion</p>
          </div>
        ) : (
          comments.map((c) => {
            const mine = c.authorUid === currentUid
            const canDelete = mine || isOwner
            const aColor = authorColor(c.authorUid, trip)

            return (
              <div key={c.id} className="flex gap-2.5">
                {/* Avatar */}
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-black flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: aColor }}
                >
                  {initials(c.authorName)}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Header */}
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-gray-800">{c.authorName}</span>
                    <span className="text-[10px] text-gray-400">{relTime(c.createdAt)}</span>
                    {c.edited && !c.deleted && (
                      <span className="text-[10px] text-gray-300 italic">(edited)</span>
                    )}
                  </div>

                  {/* Body or edit form */}
                  {c.deleted ? (
                    <p className="text-xs text-gray-400 italic mt-0.5">This comment was deleted.</p>
                  ) : editingId === c.id ? (
                    <div className="mt-1 flex gap-1.5">
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        rows={2}
                        className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary-300"
                        autoFocus
                      />
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={saveEdit}
                          className="p-1 rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors"
                          title="Save"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setEditBody('') }}
                          className="p-1 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                          title="Cancel"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-700 mt-0.5 whitespace-pre-wrap break-words leading-relaxed">
                      {c.body}
                    </p>
                  )}

                  {/* Actions for own/owner comments */}
                  {!c.deleted && editingId !== c.id && (
                    <div className="flex items-center gap-2 mt-1">
                      {mine && (
                        <button
                          onClick={() => startEdit(c)}
                          className="text-[10px] text-gray-400 hover:text-primary-500 flex items-center gap-0.5 transition-colors"
                        >
                          <Pencil size={9} /> Edit
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(c)}
                          className="text-[10px] text-gray-400 hover:text-red-500 flex items-center gap-0.5 transition-colors"
                        >
                          <Trash2 size={9} /> Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Input area */}
      <div className="flex gap-2 items-end pt-1 border-t border-gray-100">
        {/* Current user avatar */}
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-black flex-shrink-0 mb-0.5"
          style={{ backgroundColor: color }}
        >
          {initials(authorName)}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          placeholder="Add a comment… @name to mention"
          rows={2}
          className="flex-1 text-xs border border-gray-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary-300 placeholder-gray-300"
        />
        <button
          onClick={handleSubmit}
          disabled={!body.trim() || submitting}
          className="mb-0.5 p-2 rounded-xl bg-primary-500 hover:bg-primary-600 disabled:bg-gray-200 text-white transition-colors flex-shrink-0"
          title="Send (Enter)"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}
