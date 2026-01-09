'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChatWithDetails, Profile } from '@/types/database'
import { X, Users, Loader2, Pencil, UserMinus } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'

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
  const [removingUser, setRemovingUser] = useState<string | null>(null)
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

  const handleRemoveUser = async (userId: string) => {
    if (!isCreator || userId === currentUserId) return
    setRemovingUser(userId)

    const { error } = await supabase
      .from('chat_participants')
      .delete()
      .eq('chat_id', chat.id)
      .eq('user_id', userId)

    if (!error && onUpdate) {
      const updatedParticipants = chat.participants.filter(p => p.user_id !== userId)
      onUpdate({ ...chat, participants: updatedParticipants })
    }

    setRemovingUser(null)
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
              <div className="mt-3 flex flex-col items-center">
                <h3 className="text-xl font-semibold text-white text-center">{chat.name}</h3>
                {isCreator && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="mt-2 px-3 py-1 text-sm text-gray-400 hover:text-white hover:bg-dark-100 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Pencil className="w-3 h-3" />
                    Редактировать
                  </button>
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
                    className="flex items-center gap-3 p-2 hover:bg-dark-100 rounded-xl cursor-pointer transition-colors group"
                  >
                    <div onClick={() => onViewProfile(profile)}>
                      {profile.avatar_url ? (
                        <img src={profile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-primary-800 rounded-full flex items-center justify-center text-white font-semibold">
                          {profile.username[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1" onClick={() => onViewProfile(profile)}>
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
                        {profile.status === 'online' 
                          ? 'В сети' 
                          : profile.last_seen 
                            ? `был(а) ${formatDistanceToNow(new Date(profile.last_seen), { addSuffix: true, locale: ru })}`
                            : 'Не в сети'
                        }
                      </span>
                    </div>
                    {isCreator && participant.user_id !== currentUserId && !isParticipantCreator && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveUser(participant.user_id) }}
                        disabled={removingUser === participant.user_id}
                        className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-900/30 rounded-lg transition-all"
                        title="Исключить"
                      >
                        {removingUser === participant.user_id ? (
                          <Loader2 className="w-4 h-4 text-red-500 animate-spin" />
                        ) : (
                          <UserMinus className="w-4 h-4 text-red-500" />
                        )}
                      </button>
                    )}
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
