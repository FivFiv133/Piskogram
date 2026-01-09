'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChatWithDetails, Profile } from '@/types/database'
import { X, Users, Lock, Loader2, Pencil } from 'lucide-react'

interface GroupInfoModalProps {
  chat: ChatWithDetails
  currentUserId: string
  onClose: () => void
  onUpdate?: (updatedChat: ChatWithDetails) => void
  onViewProfile: (profile: Profile) => void
}

export default function GroupInfoModal({ chat, currentUserId, onClose, onUpdate, onViewProfile }: GroupInfoModalProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [groupName, setGroupName] = useState(chat.name || '')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  // Первый участник считается создателем (тот кто первым добавлен)
  const sortedParticipants = [...chat.participants].sort((a, b) => 
    new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
  )
  const creatorId = sortedParticipants[0]?.user_id
  const isCreator = creatorId === currentUserId

  const handleSave = async () => {
    if (!groupName.trim()) return
    setSaving(true)

    const { error } = await supabase
      .from('chats')
      .update({ name: groupName.trim() })
      .eq('id', chat.id)

    if (!error && onUpdate) {
      onUpdate({ ...chat, name: groupName.trim() })
    }

    setSaving(false)
    setIsEditing(false)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-200 border border-dark-50 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-dark-50 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Информация о группе</h2>
          <button onClick={onClose} className="p-1 hover:bg-dark-100 rounded-full">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Group avatar and name */}
          <div className="flex flex-col items-center">
            <div className="w-20 h-20 bg-primary-900/50 rounded-full flex items-center justify-center">
              <Users className="w-10 h-10 text-primary-500" />
            </div>
            
            {isEditing ? (
              <div className="mt-3 w-full space-y-2">
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full px-4 py-2 bg-dark-300 border border-dark-50 text-white rounded-xl text-center focus:ring-2 focus:ring-primary-500"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="flex-1 py-2 text-gray-400 hover:bg-dark-100 rounded-xl transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!groupName.trim() || saving}
                    className="flex-1 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Сохранить'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2">
                <h3 className="text-xl font-semibold text-white">{chat.name}</h3>
                {isCreator ? (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="p-1 hover:bg-dark-100 rounded-full transition-colors"
                  >
                    <Pencil className="w-4 h-4 text-gray-400" />
                  </button>
                ) : (
                  <Lock className="w-4 h-4 text-gray-500" />
                )}
              </div>
            )}
            
            <p className="text-sm text-gray-500 mt-1">{chat.participants.length} участников</p>
          </div>

          {/* Participants list */}
          <div className="border-t border-dark-50 pt-4">
            <h4 className="text-sm font-medium text-gray-400 mb-3">Участники</h4>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {chat.participants.map((participant) => {
                const profile = participant.profile as unknown as Profile
                if (!profile) return null
                const isParticipantCreator = participant.user_id === creatorId

                return (
                  <div
                    key={participant.id}
                    onClick={() => onViewProfile(profile)}
                    className="flex items-center gap-3 p-2 hover:bg-dark-100 rounded-xl cursor-pointer transition-colors"
                  >
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-primary-800 rounded-full flex items-center justify-center text-white font-semibold">
                        {profile.username[0].toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{profile.username}</span>
                        {isParticipantCreator && (
                          <span className="text-xs bg-primary-900/50 text-primary-400 px-2 py-0.5 rounded-full">
                            Создатель
                          </span>
                        )}
                        {participant.user_id === currentUserId && (
                          <span className="text-xs text-gray-500">(вы)</span>
                        )}
                      </div>
                      <span className={`text-xs ${profile.status === 'online' ? 'text-green-500' : 'text-gray-500'}`}>
                        {profile.status === 'online' ? 'В сети' : 'Не в сети'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
