'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/types/database'
import { X, Camera, LogOut, Loader2 } from 'lucide-react'

interface ProfileSidebarProps {
  profile: Profile
  onClose: () => void
  onUpdate: (profile: Profile) => void
}

export default function ProfileSidebar({ profile, onClose, onUpdate }: ProfileSidebarProps) {
  const [username, setUsername] = useState(profile.username)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const fileExt = file.name.split('.').pop()
    const filePath = `${profile.id}/avatar.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true })

    if (!uploadError) {
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath)
      
      const { data: updatedProfile } = await supabase
        .from('profiles')
        .update({ avatar_url: urlData.publicUrl })
        .eq('id', profile.id)
        .select()
        .single()

      if (updatedProfile) {
        onUpdate(updatedProfile)
      }
    }

    setUploading(false)
  }

  const handleSave = async () => {
    if (!username.trim()) return
    setSaving(true)

    const { data: updatedProfile } = await supabase
      .from('profiles')
      .update({ username: username.trim() })
      .eq('id', profile.id)
      .select()
      .single()

    if (updatedProfile) {
      onUpdate(updatedProfile)
    }

    setSaving(false)
  }

  const handleLogout = async () => {
    await supabase.from('profiles').update({ status: 'offline', last_seen: new Date().toISOString() }).eq('id', profile.id)
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-200 border border-dark-50 rounded-2xl w-full max-w-sm">
        <div className="p-4 border-b border-dark-50 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Профиль</h2>
          <button onClick={onClose} className="p-1 hover:bg-dark-100 rounded-full">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex flex-col items-center">
            <div className="relative">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-24 h-24 rounded-full object-cover" />
              ) : (
                <div className="w-24 h-24 bg-gradient-to-br from-primary-600 to-primary-800 rounded-full flex items-center justify-center text-white text-3xl font-semibold">
                  {profile.username[0].toUpperCase()}
                </div>
              )}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleAvatarUpload}
                className="hidden"
                accept="image/*"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute bottom-0 right-0 bg-primary-600 hover:bg-primary-700 text-white p-2 rounded-full transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-500">{profile.email}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Имя пользователя</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 bg-dark-300 border border-dark-50 text-white rounded-xl focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={!username.trim() || username === profile.username || saving}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Сохранение...
              </>
            ) : (
              'Сохранить'
            )}
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 text-primary-500 hover:bg-primary-900/30 font-medium py-2 rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Выйти
          </button>
        </div>
      </div>
    </div>
  )
}
