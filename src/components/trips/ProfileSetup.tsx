'use client'

import { useState } from 'react'
import { MapPin } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { useApp } from '@/context/AppContext'

interface ProfileSetupProps {
  open: boolean
}

export default function ProfileSetup({ open }: ProfileSetupProps) {
  const { saveProfile } = useApp()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Please enter your name')
      return
    }
    setSaving(true)
    await saveProfile(name.trim())
    setSaving(false)
  }

  return (
    <Modal open={open} onClose={() => {}}>
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <MapPin size={28} className="text-primary-600" />
        </div>
        <h2 className="text-xl font-black text-gray-900">Welcome to VoyaGO!</h2>
        <p className="text-sm text-gray-500 mt-1">Let&apos;s set up your traveler profile.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Your name"
          placeholder="e.g. Alex"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError('')
          }}
          error={error}
          autoFocus
        />
        <Button type="submit" className="w-full" size="lg" disabled={saving}>
          {saving ? 'Saving…' : 'Get Started →'}
        </Button>
      </form>
    </Modal>
  )
}
