'use client'

import { Profile } from '@/types/database'
import { X, Mail } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'

interface UserProfileModalProps {
  profile: Profile
  onClose: () => void
}

export default function UserProfileModal({ profile, onClose }: UserProfileModalProps) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-200 border border-dark-50 rounded-2xl w-full max-w-sm">
        <div className="p-4 border-b border-dark-50 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Профиль</h2>
          <button onClick={onClose} className="p-1 hover:bg-dark-100 rounded-full">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex flex-col items-center">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-24 h-24 rounded-full object-cover" />
            ) : (
              <div className="w-24 h-24 bg-gradient-to-br from-primary-600 to-primary-800 rounded-full flex items-center justify-center text-white text-3xl font-semibold">
                {profile.username[0].toUpperCase()}
              </div>
            )}
            <h3 className="mt-3 text-xl font-semibold text-white">{profile.username}</h3>
            <div className="flex items-center gap-2 mt-1">
              <div className={`w-2 h-2 rounded-full ${profile.status === 'online' ? 'bg-green-500' : 'bg-gray-500'}`} />
              <span className={profile.status === 'online' ? 'text-green-500 text-sm' : 'text-gray-500 text-sm'}>
                {profile.status === 'online' 
                  ? 'В сети' 
                  : profile.last_seen 
                    ? `был(а) ${formatDistanceToNow(new Date(profile.last_seen), { addSuffix: true, locale: ru })}`
                    : 'Не в сети'
                }
              </span>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-dark-50">
            <div className="flex items-center gap-3 text-gray-400">
              <Mail className="w-5 h-5" />
              <span className="text-sm">{profile.email}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
