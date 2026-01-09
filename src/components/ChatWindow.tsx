'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChatWithDetails, Message, Profile } from '@/types/database'
import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Send, Paperclip, Smile, MoreVertical, Phone, Video, Users, ArrowLeft, X, Check, CheckCheck, User, Settings } from 'lucide-react'
import clsx from 'clsx'
import ImageModal from './ImageModal'
import UserProfileModal from './UserProfileModal'
import GroupInfoModal from './GroupInfoModal'

interface ChatWindowProps {
  chat: ChatWithDetails
  currentUserId: string
  onBack?: () => void
  onChatUpdate?: (chat: ChatWithDetails) => void
}

export default function ChatWindow({ chat, currentUserId, onBack, onChatUpdate }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [viewProfile, setViewProfile] = useState<Profile | null>(null)
  const [showGroupInfo, setShowGroupInfo] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const notificationSound = useRef<HTMLAudioElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  // Initialize notification sound
  useEffect(() => {
    notificationSound.current = new Audio('/notification.mp3')
    notificationSound.current.volume = 0.5
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const otherParticipant = chat.participants.find(p => p.user_id !== currentUserId)
  const otherProfile = otherParticipant?.profile as unknown as Profile | undefined

  useEffect(() => {
    loadMessages()
    markAsRead()

    const channel = supabase
      .channel(`messages:${chat.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${chat.id}`,
      }, async (payload) => {
        const newMsg = payload.new as Message
        
        const { data: senderProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', newMsg.sender_id)
          .single()
        
        const msgWithSender = { ...newMsg, sender: senderProfile }
        setMessages(prev => [...prev, msgWithSender])
        
        if (newMsg.sender_id !== currentUserId) {
          markAsRead()
          if (notificationSound.current) {
            notificationSound.current.play().catch(() => {})
          }
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${chat.id}`,
      }, (payload) => {
        const updatedMsg = payload.new as Message
        setMessages(prev => prev.map(msg => 
          msg.id === updatedMsg.id ? { ...msg, is_read: updatedMsg.is_read } : msg
        ))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [chat.id, currentUserId])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const loadMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*, sender:profiles(*)')
      .eq('chat_id', chat.id)
      .order('created_at', { ascending: true })

    setMessages(data || [])
    setLoading(false)
  }

  const markAsRead = async () => {
    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('chat_id', chat.id)
      .neq('sender_id', currentUserId)
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      if (file.type.startsWith('image/')) {
        setPreviewUrl(URL.createObjectURL(file))
      }
    }
  }

  const clearFile = () => {
    setSelectedFile(null)
    setPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((!newMessage.trim() && !selectedFile) || sending) return

    setSending(true)
    let fileUrl = null
    let messageType: 'text' | 'image' | 'file' = 'text'

    if (selectedFile) {
      const fileExt = selectedFile.name.split('.').pop()
      const fileName = `${Date.now()}.${fileExt}`
      const filePath = `${chat.id}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('chat-files')
        .upload(filePath, selectedFile)

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('chat-files').getPublicUrl(filePath)
        fileUrl = urlData.publicUrl
        messageType = selectedFile.type.startsWith('image/') ? 'image' : 'file'
      }
    }

    const { error } = await supabase.from('messages').insert({
      chat_id: chat.id,
      sender_id: currentUserId,
      content: newMessage.trim() || (selectedFile?.name || ''),
      message_type: messageType,
      file_url: fileUrl,
    })

    if (!error) {
      await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', chat.id)
      setNewMessage('')
      clearFile()
    }

    setSending(false)
  }

  const getChatTitle = () => {
    if (chat.is_group && chat.name) return chat.name
    return otherProfile?.username || 'Чат'
  }

  const getStatusText = () => {
    if (chat.is_group) {
      return `${chat.participants.length} участников`
    }
    if (otherProfile?.status === 'online') return 'в сети'
    if (otherProfile?.last_seen) {
      return `был(а) ${formatDistanceToNow(new Date(otherProfile.last_seen), { addSuffix: true, locale: ru })}`
    }
    return 'не в сети'
  }

  const handleHeaderClick = () => {
    if (chat.is_group) {
      setShowGroupInfo(true)
    } else if (otherProfile) {
      setViewProfile(otherProfile)
    }
  }

  return (
    <div className="h-full w-full flex flex-col bg-dark-300">
      {/* Header */}
      <div className="bg-dark-200 border-b border-dark-50 px-4 py-3 flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="p-1 hover:bg-dark-100 rounded-full lg:hidden">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </button>
        )}
        <div 
          className="flex-1 flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={handleHeaderClick}
        >
          {chat.is_group ? (
            <div className="w-10 h-10 bg-primary-900/50 rounded-full flex items-center justify-center">
              <Users className="w-5 h-5 text-primary-500" />
            </div>
          ) : otherProfile?.avatar_url ? (
            <img src={otherProfile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-primary-800 rounded-full flex items-center justify-center text-white font-semibold">
              {(otherProfile?.username || 'U')[0].toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="font-semibold text-white">{getChatTitle()}</h2>
            <p className={clsx('text-xs', otherProfile?.status === 'online' ? 'text-green-500' : 'text-gray-500')}>
              {getStatusText()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-2 hover:bg-dark-100 rounded-full transition-colors">
            <Phone className="w-5 h-5 text-gray-400" />
          </button>
          <button className="p-2 hover:bg-dark-100 rounded-full transition-colors">
            <Video className="w-5 h-5 text-gray-400" />
          </button>
          <div className="relative" ref={dropdownRef}>
            <button 
              onClick={() => setShowDropdown(!showDropdown)}
              className="p-2 hover:bg-dark-100 rounded-full transition-colors"
            >
              <MoreVertical className="w-5 h-5 text-gray-400" />
            </button>
            {showDropdown && (
              <div className="absolute right-0 top-full mt-1 bg-dark-200 border border-dark-50 rounded-xl shadow-lg py-1 min-w-[180px] z-10">
                {chat.is_group ? (
                  <button
                    onClick={() => { setShowGroupInfo(true); setShowDropdown(false) }}
                    className="w-full px-4 py-2 text-left text-white hover:bg-dark-100 flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    Информация о группе
                  </button>
                ) : otherProfile && (
                  <button
                    onClick={() => { setViewProfile(otherProfile); setShowDropdown(false) }}
                    className="w-full px-4 py-2 text-left text-white hover:bg-dark-100 flex items-center gap-2"
                  >
                    <User className="w-4 h-4" />
                    Посмотреть профиль
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>Начните общение!</p>
          </div>
        ) : (
          messages.map((message, index) => {
            const isOwn = message.sender_id === currentUserId
            const showAvatar = !isOwn && (index === 0 || messages[index - 1].sender_id !== message.sender_id)
            const sender = message.sender as Profile | undefined

            return (
              <div
                key={message.id}
                className={clsx('flex gap-2 message-enter', isOwn ? 'justify-end' : 'justify-start')}
              >
                {!isOwn && (
                  <div className="w-8 h-8 flex-shrink-0">
                    {showAvatar && (
                      <div 
                        className="cursor-pointer"
                        onClick={() => sender && setViewProfile(sender)}
                      >
                        {sender?.avatar_url ? (
                          <img src={sender.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 bg-gradient-to-br from-primary-600 to-primary-800 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                            {(sender?.username || 'U')[0].toUpperCase()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div
                  className={clsx(
                    'max-w-[70%] rounded-2xl px-4 py-2',
                    isOwn
                      ? 'bg-primary-600 text-white rounded-br-md'
                      : 'bg-dark-100 text-gray-100 rounded-bl-md'
                  )}
                >
                  {chat.is_group && !isOwn && showAvatar && sender && (
                    <p 
                      className="text-xs text-primary-400 font-medium mb-1 cursor-pointer hover:underline"
                      onClick={() => setViewProfile(sender)}
                    >
                      {sender.username}
                    </p>
                  )}
                  {message.message_type === 'image' && message.file_url && (
                    <img
                      src={message.file_url}
                      alt=""
                      className="rounded-lg max-w-[300px] max-h-[300px] object-contain mb-2 cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setSelectedImage(message.file_url!)}
                    />
                  )}
                  {message.message_type === 'file' && message.file_url && (
                    <a
                      href={message.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={clsx(
                        'flex items-center gap-2 mb-2 p-2 rounded-lg',
                        isOwn ? 'bg-primary-700' : 'bg-dark-200'
                      )}
                    >
                      <Paperclip className="w-4 h-4" />
                      <span className="text-sm truncate">{message.content}</span>
                    </a>
                  )}
                  {message.message_type === 'text' && <p className="break-words">{message.content}</p>}
                  <div className={clsx('flex items-center gap-1 mt-1', isOwn ? 'justify-end' : 'justify-start')}>
                    <span className={clsx('text-xs', isOwn ? 'text-primary-200' : 'text-gray-500')}>
                      {new Date(message.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isOwn && (
                      message.is_read ? (
                        <CheckCheck className="w-4 h-4 text-primary-200" />
                      ) : (
                        <Check className="w-4 h-4 text-primary-200" />
                      )
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* File Preview */}
      {previewUrl && (
        <div className="px-4 py-2 bg-dark-200 border-t border-dark-50">
          <div className="relative inline-block">
            <img src={previewUrl} alt="" className="h-20 rounded-lg" />
            <button
              onClick={clearFile}
              className="absolute -top-2 -right-2 bg-primary-600 text-white rounded-full p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={sendMessage} className="bg-dark-200 border-t border-dark-50 p-4">
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.txt"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 hover:bg-dark-100 rounded-full transition-colors"
          >
            <Paperclip className="w-5 h-5 text-gray-400" />
          </button>
          <button type="button" className="p-2 hover:bg-dark-100 rounded-full transition-colors">
            <Smile className="w-5 h-5 text-gray-400" />
          </button>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Написать сообщение..."
            className="flex-1 px-4 py-2 bg-dark-300 border border-dark-50 text-white rounded-full focus:ring-2 focus:ring-primary-500 placeholder-gray-500"
          />
          <button
            type="submit"
            disabled={(!newMessage.trim() && !selectedFile) || sending}
            className="p-2 bg-primary-600 hover:bg-primary-700 text-white rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>

      {/* Modals */}
      {selectedImage && (
        <ImageModal imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />
      )}

      {viewProfile && (
        <UserProfileModal profile={viewProfile} onClose={() => setViewProfile(null)} />
      )}

      {showGroupInfo && (
        <GroupInfoModal
          chat={chat}
          currentUserId={currentUserId}
          onClose={() => setShowGroupInfo(false)}
          onUpdate={(updatedChat) => {
            if (onChatUpdate) onChatUpdate(updatedChat)
            setShowGroupInfo(false)
          }}
          onViewProfile={(profile) => {
            setShowGroupInfo(false)
            setViewProfile(profile)
          }}
        />
      )}
    </div>
  )
}
