'use client'

import { useState } from 'react'
import { Trash2, Calendar, AlertTriangle, User, ChevronDown, Link2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import {
  STATUS_META, PRIORITY_META, CATEGORY_META,
  TASK_STATUSES, TASK_PRIORITIES, nameInitials, colorFromUid,
} from './meta'
import type { TripTask, TaskStatus, TaskPriority, UserProfile } from '@/types'

interface TaskCardProps {
  task: TripTask
  members: UserProfile[]
  currentUid: string
  isOwner: boolean
  onStatusChange: (task: TripTask, status: TaskStatus) => void
  onPriorityChange: (task: TripTask, priority: TaskPriority) => void
  onAssign: (task: TripTask, uid: string | null) => void
  onDelete: (task: TripTask) => void
}

function isOverdue(task: TripTask): boolean {
  if (!task.dueDate) return false
  if (task.status === 'done' || task.status === 'cancelled') return false
  const today = new Date().toISOString().slice(0, 10)
  return task.dueDate < today
}

export default function TaskCard({
  task,
  members,
  currentUid,
  isOwner,
  onStatusChange,
  onPriorityChange,
  onAssign,
  onDelete,
}: TaskCardProps) {
  const [assignOpen, setAssignOpen] = useState(false)

  const status = STATUS_META[task.status]
  const priority = PRIORITY_META[task.priority]
  const category = CATEGORY_META[task.category]
  const overdue = isOverdue(task)

  // Edit rights: creator, current assignee, or trip owner.
  const canManage =
    isOwner || task.createdByUid === currentUid || task.assignedToUid === currentUid

  const assigneeColor = task.assignedToUid ? colorFromUid(task.assignedToUid) : '#cbd5e1'
  const done = task.status === 'done'
  const cancelled = task.status === 'cancelled'

  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-4 transition-all ${
      overdue ? 'border-red-200' : 'border-gray-100'
    } ${cancelled ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        {/* Category icon */}
        <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0 text-base">
          {category.icon}
        </div>

        <div className="flex-1 min-w-0">
          {/* Title + badges */}
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm font-bold ${done || cancelled ? 'line-through text-gray-400' : 'text-gray-900'}`}>
              {task.title}
            </p>
            {canManage && (
              <button
                onClick={() => onDelete(task)}
                className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                aria-label="Delete task"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>

          {task.description && (
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{task.description}</p>
          )}

          {/* Meta chips */}
          <div className="flex items-center gap-1.5 flex-wrap mt-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${priority.cls}`}>
              {priority.label}
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-50 text-gray-500">
              {category.label}
            </span>
            {task.dueDate && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                overdue ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500'
              }`}>
                {overdue ? <AlertTriangle size={9} /> : <Calendar size={9} />}
                {formatDate(task.dueDate)}
              </span>
            )}
            {(task.linkedActivityId || task.linkedExpenseId || task.linkedMemoryId) && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary-50 text-primary-600 inline-flex items-center gap-1">
                <Link2 size={9} /> Linked
              </span>
            )}
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-2 flex-wrap mt-3">
            {/* Status selector */}
            <div className="relative">
              <select
                value={task.status}
                onChange={(e) => onStatusChange(task, e.target.value as TaskStatus)}
                disabled={!canManage}
                className={`appearance-none text-[11px] font-bold pl-2.5 pr-6 py-1 rounded-full cursor-pointer disabled:cursor-default ${status.cls}`}
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_META[s].label}</option>
                ))}
              </select>
              <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-current opacity-60" />
            </div>

            {/* Priority selector */}
            <div className="relative">
              <select
                value={task.priority}
                onChange={(e) => onPriorityChange(task, e.target.value as TaskPriority)}
                disabled={!canManage}
                className={`appearance-none text-[11px] font-bold pl-2.5 pr-6 py-1 rounded-full cursor-pointer disabled:cursor-default ${priority.cls}`}
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{PRIORITY_META[p].label}</option>
                ))}
              </select>
              <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-current opacity-60" />
            </div>

            {/* Assignment */}
            <div className="relative">
              <button
                onClick={() => canManage && setAssignOpen((o) => !o)}
                disabled={!canManage}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors disabled:cursor-default"
              >
                {task.assignedToUid ? (
                  <>
                    <span
                      className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[7px] font-black"
                      style={{ backgroundColor: assigneeColor }}
                    >
                      {nameInitials(task.assignedToName ?? '?')}
                    </span>
                    {task.assignedToName}
                  </>
                ) : (
                  <>
                    <User size={11} /> Unassigned
                  </>
                )}
                {canManage && <ChevronDown size={10} className="opacity-60" />}
              </button>

              {assignOpen && canManage && (
                <div className="absolute left-0 top-full mt-1 w-44 bg-white rounded-xl border border-gray-100 shadow-lg z-20 overflow-hidden py-1">
                  <button
                    onClick={() => { onAssign(task, null); setAssignOpen(false) }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    Unassign
                  </button>
                  {members.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { onAssign(task, m.id); setAssignOpen(false) }}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                    >
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[7px] font-black flex-shrink-0"
                        style={{ backgroundColor: m.color ?? colorFromUid(m.id) }}
                      >
                        {nameInitials(m.name)}
                      </span>
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer: created by */}
          <p className="text-[10px] text-gray-300 mt-2">
            Added by {task.createdByName}
          </p>
        </div>
      </div>
    </div>
  )
}
