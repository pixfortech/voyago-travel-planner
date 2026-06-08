'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, BellOff, Camera, Check } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/lib/notifications'
import type { InAppNotification } from '@/types'

function fmtTime(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export default function NotificationBell() {
  const { user } = useApp()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<InAppNotification[]>([])
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const isRealUser = !!(user && !user.isAnonymous)
  const unread = notifications.filter((n) => !n.read).length

  // Initial load when user is available
  useEffect(() => {
    if (!isRealUser || !user) return
    setLoading(true)
    getNotifications(user.uid)
      .then(setNotifications)
      .finally(() => setLoading(false))
  }, [user, isRealUser])

  // Refresh on each panel open
  useEffect(() => {
    if (!open || !isRealUser || !user) return
    getNotifications(user.uid).then(setNotifications)
  }, [open, user, isRealUser])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function handleNotificationClick(n: InAppNotification) {
    if (!isRealUser || !user) return
    if (!n.read) {
      await markNotificationRead(user.uid, n.id)
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))
      )
    }
    setOpen(false)
    if (n.tripId) {
      router.push(`/trips/${n.tripId}/memories`)
    }
  }

  async function handleMarkAll() {
    if (!isRealUser || !user) return
    await markAllNotificationsRead(user.uid)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  if (!isRealUser) return null

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center px-0.5">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl border border-gray-100 shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
            <p className="text-sm font-black text-gray-800">Notifications</p>
            {unread > 0 && (
              <button
                onClick={handleMarkAll}
                className="text-[11px] font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1 transition-colors"
              >
                <Check size={10} /> Mark all read
              </button>
            )}
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-8 text-center">
              <BellOff size={22} className="mx-auto mb-2 text-gray-300" />
              <p className="text-xs text-gray-400">No notifications yet</p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors ${
                    !n.read ? 'bg-blue-50/40' : ''
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Camera size={12} className="text-rose-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs leading-snug ${
                        n.read ? 'font-medium text-gray-700' : 'font-semibold text-gray-900'
                      }`}
                    >
                      {n.title}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{n.message}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{fmtTime(n.createdAt)}</p>
                  </div>
                  {!n.read && (
                    <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
