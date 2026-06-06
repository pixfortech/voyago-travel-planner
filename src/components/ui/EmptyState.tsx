'use client'

import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export default function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex flex-col items-center justify-center text-center py-12 px-6', className)}
    >
      <div className="w-20 h-20 bg-gradient-to-br from-primary-50 to-teal-50 rounded-3xl flex items-center justify-center mb-5">
        <div className="text-primary-400">{icon}</div>
      </div>
      <h3 className="font-bold text-gray-900 text-lg mb-2">{title}</h3>
      {description && (
        <p className="text-gray-400 text-sm leading-relaxed mb-6 max-w-xs">{description}</p>
      )}
      {action}
    </motion.div>
  )
}
