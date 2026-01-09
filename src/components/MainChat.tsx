'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile, ChatWithDetails } from '@/types/database'
import ChatList from './ChatList'
import ChatWindow from './ChatWindow'
import NewChatModal from './NewChatModal'
import ProfileSidebar from './ProfileSidebar'
import { MessageCircle, Settings } from 'lucide-react'
import clsx from 'clsx'

interface MainChatProps {
  initialProfile: Profile
}

export default function MainChat({ initialProfile }: MainChatProps) {
  const [profile, setProfile] = useState<Profile>(initialProfile)
  const [selectedChat, setSelectedChat] = useState<ChatWithDetails | null>(null)
  const [showNewChat, setShowNewChat] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [refreshChats, setRefreshChats] = useState(0)
  const supabase = createClient()

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024)
    checkMobile()
    window.addEventListener('resize', checkMobile)

    const interval = setInterval(() => {
      supabase
        .from('profiles')
        .update({ status: 'online', last_seen: new Date().toISOString() })
        .eq('id', profile.id)
    }, 30000)

    const handleBeforeUnload = () => {
      navigator.sendBeacon('/api/offline', JSON.stringify({ userId: profile.id }))
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('resize', checkMobile)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      clearInterval(interval)
    }
  }, [profile.id])

  const handleChatCreated = async (chatId: string) => {
    setShowNewChat(false)
    
    const { data: chat } = await supabase
      .from('chats')
      .select('*')
      .eq('id', chatId)
      .single()

    if (chat) {
      const { data: participants } = await supabase
        .from('chat_participants')
        .select('*, profile:profiles(*)')
        .eq('chat_id', chatId)

      setSelectedChat({
        ...chat,
        participants: participants || [],
      })

      // Trigger chat list refresh
      setRefreshChats(prev => prev + 1)
    }
  }

  return (
    <div className="h-screen flex bg-dark-300">
      {/* Sidebar */}
      <div
        className={clsx(
          'flex flex-col bg-dark-200 border-r border-dark-50',
          isMobile && selectedChat ? 'hidden' : 'w-full lg:w-80'
        )}
      >
        {/* User header */}
        <div className="p-4 border-b border-dark-50 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setShowProfile(true)}>
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-primary-800 rounded-full flex items-center justify-center text-white font-semibold">
                {profile.username[0].toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-medium text-white">{profile.username}</p>
              <p className="text-xs text-green-500">В сети</p>
            </div>
          </div>
          <button
            onClick={() => setShowProfile(true)}
            className="p-2 hover:bg-dark-100 rounded-full transition-colors"
          >
            <Settings className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-hidden">
          <ChatList
            currentUserId={profile.id}
            selectedChatId={selectedChat?.id || null}
            onSelectChat={setSelectedChat}
            onNewChat={() => setShowNewChat(true)}
            refreshTrigger={refreshChats}
          />
        </div>
      </div>

      {/* Chat window */}
      <div
        className={clsx(
          'flex-1 flex',
          isMobile && !selectedChat ? 'hidden' : ''
        )}
      >
        {selectedChat ? (
          <div className="flex-1 w-full">
            <ChatWindow
              chat={selectedChat}
              currentUserId={profile.id}
              onBack={isMobile ? () => setSelectedChat(null) : undefined}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-dark-300 text-gray-500">
            <MessageCircle className="w-16 h-16 mb-4 text-primary-600" />
            <p className="text-lg">Выберите чат или начните новый</p>
          </div>
        )}
      </div>

      {/* Modals */}
      {showNewChat && (
        <NewChatModal
          currentUserId={profile.id}
          onClose={() => setShowNewChat(false)}
          onChatCreated={handleChatCreated}
        />
      )}

      {showProfile && (
        <ProfileSidebar
          profile={profile}
          onClose={() => setShowProfile(false)}
          onUpdate={(updated) => {
            setProfile(updated)
            setShowProfile(false)
          }}
        />
      )}
    </div>
  )
}
