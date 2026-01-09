'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChatWithDetails, Profile } from '@/types/database'
import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Search, Plus, Users, MessageCircle, Check, CheckCheck } from 'lucide-react'
import clsx from 'clsx'

interface ChatListProps {
  currentUserId: string
  selectedChatId: string | null
  onSelectChat: (chat: ChatWithDetails) => void
  onNewChat: () => void
  refreshTrigger?: number
}

export default function ChatList({ currentUserId, selectedChatId, onSelectChat, onNewChat, refreshTrigger }: ChatListProps) {
  const [chats, setChats] = useState<ChatWithDetails[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    loadChats()
  }, [refreshTrigger])

  useEffect(() => {
    const channel = supabase
      .channel('chat-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        loadChats()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, () => {
        loadChats()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadChats = async () => {
    const { data: participantData } = await supabase
      .from('chat_participants')
      .select('chat_id')
      .eq('user_id', currentUserId)

    if (!participantData?.length) {
      setChats([])
      setLoading(false)
      return
    }

    const chatIds = participantData.map(p => p.chat_id)

    const { data: chatsData } = await supabase
      .from('chats')
      .select('*')
      .in('id', chatIds)
      .order('updated_at', { ascending: false })

    if (!chatsData) {
      setLoading(false)
      return
    }

    const chatsWithDetails: ChatWithDetails[] = await Promise.all(
      chatsData.map(async (chat) => {
        const { data: participants } = await supabase
          .from('chat_participants')
          .select('*, profile:profiles(*)')
          .eq('chat_id', chat.id)

        const { data: lastMessage } = await supabase
          .from('messages')
          .select('*, sender:profiles(*)')
          .eq('chat_id', chat.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        // Преобразуем sender в правильный тип
        const typedLastMessage = lastMessage ? {
          ...lastMessage,
          sender: lastMessage.sender as unknown as Profile
        } : undefined

        const { count: unreadCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('chat_id', chat.id)
          .eq('is_read', false)
          .neq('sender_id', currentUserId)

        return {
          ...chat,
          participants: participants || [],
          last_message: typedLastMessage,
          unread_count: unreadCount || 0,
        }
      })
    )

    setChats(chatsWithDetails)
    setLoading(false)
  }

  const getChatName = (chat: ChatWithDetails) => {
    if (chat.is_group && chat.name) return chat.name
    const otherParticipant = chat.participants.find(p => p.user_id !== currentUserId)
    const profile = otherParticipant?.profile as unknown as Profile | undefined
    return profile?.username || 'Чат'
  }

  const getChatAvatar = (chat: ChatWithDetails) => {
    if (chat.is_group) {
      return (
        <div className="w-12 h-12 bg-primary-900/50 rounded-full flex items-center justify-center">
          <Users className="w-6 h-6 text-primary-500" />
        </div>
      )
    }
    const otherParticipant = chat.participants.find(p => p.user_id !== currentUserId)
    const profile = otherParticipant?.profile as unknown as Profile | undefined
    if (profile?.avatar_url) {
      return <img src={profile.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" />
    }
    return (
      <div className="w-12 h-12 bg-gradient-to-br from-primary-600 to-primary-800 rounded-full flex items-center justify-center text-white font-semibold">
        {(profile?.username || 'U')[0].toUpperCase()}
      </div>
    )
  }

  const filteredChats = chats.filter(chat => 
    getChatName(chat).toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="h-full flex flex-col bg-dark-200 border-r border-dark-50">
      <div className="p-4 border-b border-dark-50">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-white">Чаты</h1>
          <button
            onClick={onNewChat}
            className="p-2 hover:bg-dark-100 rounded-full transition-colors"
          >
            <Plus className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск..."
            className="w-full pl-9 pr-4 py-2 bg-dark-300 border border-dark-50 text-white rounded-xl text-sm focus:ring-2 focus:ring-primary-500 placeholder-gray-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <MessageCircle className="w-12 h-12 mb-2" />
            <p>Нет чатов</p>
            <button onClick={onNewChat} className="mt-2 text-primary-500 hover:text-primary-400">
              Начать новый чат
            </button>
          </div>
        ) : (
          filteredChats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => onSelectChat(chat)}
              className={clsx(
                'flex items-center gap-3 p-4 cursor-pointer transition-colors',
                selectedChatId === chat.id ? 'bg-primary-900/30 border-l-2 border-primary-500' : 'hover:bg-dark-100'
              )}
            >
              {getChatAvatar(chat)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white truncate">{getChatName(chat)}</span>
                  {chat.last_message && (
                    <span className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(chat.last_message.created_at), { addSuffix: true, locale: ru })}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-sm text-gray-400 truncate">
                    {chat.last_message?.content || 'Нет сообщений'}
                  </p>
                  {chat.unread_count && chat.unread_count > 0 ? (
                    <span className="bg-primary-600 text-white text-xs px-2 py-0.5 rounded-full min-w-[20px] text-center">
                      {chat.unread_count}
                    </span>
                  ) : chat.last_message && chat.last_message.sender_id === currentUserId ? (
                    chat.last_message.is_read ? (
                      <CheckCheck className="w-4 h-4 text-primary-500" />
                    ) : (
                      <Check className="w-4 h-4 text-gray-500" />
                    )
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
