'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/types/database'
import { X, Search, Users, Check, Loader2, UserPlus } from 'lucide-react'
import clsx from 'clsx'

interface NewChatModalProps {
  currentUserId: string
  onClose: () => void
  onChatCreated: (chatId: string) => void
}

export default function NewChatModal({ currentUserId, onClose, onChatCreated }: NewChatModalProps) {
  const [recentUsers, setRecentUsers] = useState<Profile[]>([])
  const [searchResults, setSearchResults] = useState<Profile[]>([])
  const [search, setSearch] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [isGroup, setIsGroup] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [creating, setCreating] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    loadRecentUsers()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.trim().length >= 2) {
        searchUsers()
      } else {
        setSearchResults([])
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [search])

  const loadRecentUsers = async () => {
    // Получаем пользователей, с которыми уже есть чаты
    const { data: myChats } = await supabase
      .from('chat_participants')
      .select('chat_id')
      .eq('user_id', currentUserId)

    if (!myChats?.length) {
      setLoading(false)
      return
    }

    const chatIds = myChats.map(c => c.chat_id)

    const { data: otherParticipants } = await supabase
      .from('chat_participants')
      .select('user_id, profile:profiles(*)')
      .in('chat_id', chatIds)
      .neq('user_id', currentUserId)

    if (otherParticipants) {
      // Убираем дубликаты
      const uniqueUsers = new Map<string, Profile>()
      otherParticipants.forEach(p => {
        if (p.profile && !uniqueUsers.has(p.user_id)) {
          uniqueUsers.set(p.user_id, p.profile as Profile)
        }
      })
      setRecentUsers(Array.from(uniqueUsers.values()))
    }

    setLoading(false)
  }

  const searchUsers = async () => {
    if (search.trim().length < 2) return
    
    setSearching(true)
    
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', currentUserId)
      .ilike('username', `%${search.trim()}%`)
      .limit(10)

    setSearchResults(data || [])
    setSearching(false)
  }

  const toggleUser = (userId: string) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }

  const createChat = async () => {
    if (selectedUsers.length === 0) return
    setCreating(true)

    if (!isGroup && selectedUsers.length === 1) {
      const { data: existingChats } = await supabase
        .from('chat_participants')
        .select('chat_id')
        .eq('user_id', currentUserId)

      if (existingChats) {
        for (const ec of existingChats) {
          const { data: participants } = await supabase
            .from('chat_participants')
            .select('user_id')
            .eq('chat_id', ec.chat_id)

          const { data: chatData } = await supabase
            .from('chats')
            .select('is_group')
            .eq('id', ec.chat_id)
            .single()

          if (
            chatData &&
            !chatData.is_group &&
            participants?.length === 2 &&
            participants.some(p => p.user_id === selectedUsers[0])
          ) {
            onChatCreated(ec.chat_id)
            return
          }
        }
      }
    }

    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .insert({
        name: isGroup ? groupName : null,
        is_group: isGroup,
      })
      .select()
      .single()

    if (chatError || !chat) {
      setCreating(false)
      return
    }

    const participants = [currentUserId, ...selectedUsers].map(userId => ({
      chat_id: chat.id,
      user_id: userId,
    }))

    await supabase.from('chat_participants').insert(participants)

    onChatCreated(chat.id)
  }

  const displayUsers = search.trim().length >= 2 ? searchResults : recentUsers

  const getUserById = (userId: string) => {
    return [...recentUsers, ...searchResults].find(u => u.id === userId)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-200 border border-dark-50 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-dark-50 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Новый чат</h2>
          <button onClick={onClose} className="p-1 hover:bg-dark-100 rounded-full">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-4 border-b border-dark-50 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по нику (мин. 2 символа)..."
              className="w-full pl-9 pr-4 py-2 bg-dark-300 border border-dark-50 text-white rounded-xl text-sm focus:ring-2 focus:ring-primary-500 placeholder-gray-500"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 animate-spin" />
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isGroup}
              onChange={(e) => setIsGroup(e.target.checked)}
              className="w-4 h-4 text-primary-600 bg-dark-300 border-dark-50 rounded focus:ring-primary-500"
            />
            <Users className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-300">Создать группу</span>
          </label>

          {isGroup && (
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Название группы"
              className="w-full px-4 py-2 bg-dark-300 border border-dark-50 text-white rounded-xl text-sm focus:ring-2 focus:ring-primary-500 placeholder-gray-500"
            />
          )}

          {/* Selected users chips */}
          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedUsers.map(userId => {
                const user = getUserById(userId)
                if (!user) return null
                return (
                  <div
                    key={userId}
                    className="flex items-center gap-1 bg-primary-900/50 text-primary-300 px-2 py-1 rounded-full text-sm"
                  >
                    <span>{user.username}</span>
                    <button onClick={() => toggleUser(userId)} className="hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : search.trim().length >= 2 && searchResults.length === 0 && !searching ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500">
              <UserPlus className="w-8 h-8 mb-2" />
              <p>Пользователь не найден</p>
            </div>
          ) : displayUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500 px-4 text-center">
              <UserPlus className="w-8 h-8 mb-2" />
              <p>Введите ник пользователя для поиска</p>
            </div>
          ) : (
            <>
              {search.trim().length < 2 && recentUsers.length > 0 && (
                <div className="px-4 py-2 text-xs text-gray-500 uppercase tracking-wider">
                  Недавние контакты
                </div>
              )}
              {search.trim().length >= 2 && searchResults.length > 0 && (
                <div className="px-4 py-2 text-xs text-gray-500 uppercase tracking-wider">
                  Результаты поиска
                </div>
              )}
              {displayUsers.map(user => (
                <div
                  key={user.id}
                  onClick={() => toggleUser(user.id)}
                  className={clsx(
                    'flex items-center gap-3 p-4 cursor-pointer transition-colors',
                    selectedUsers.includes(user.id) ? 'bg-primary-900/30' : 'hover:bg-dark-100'
                  )}
                >
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-primary-800 rounded-full flex items-center justify-center text-white font-semibold">
                      {user.username[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-white">{user.username}</p>
                    <p className="text-sm text-gray-500">{user.email}</p>
                  </div>
                  {selectedUsers.includes(user.id) && (
                    <div className="w-6 h-6 bg-primary-600 rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="p-4 border-t border-dark-50">
          <button
            onClick={createChat}
            disabled={selectedUsers.length === 0 || (isGroup && !groupName.trim()) || creating}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {creating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Создание...
              </>
            ) : (
              `Создать чат${selectedUsers.length > 0 ? ` (${selectedUsers.length})` : ''}`
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
