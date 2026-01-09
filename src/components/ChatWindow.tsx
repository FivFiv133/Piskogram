'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChatWithDetails, Message, Profile } from '@/types/database'
import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Send, Paperclip, Smile, MoreVertical, Phone, Video, Users, ArrowLeft, X, Check, CheckCheck, User, Pencil, PhoneCall } from 'lucide-react'
import clsx from 'clsx'
import ImageModal from './ImageModal'
import UserProfileModal from './UserProfileModal'
import GroupInfoModal from './GroupInfoModal'
import CallModal from './CallModal'

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
  const [editingMessage, setEditingMessage] = useState<Message | null>(null)
  const [editText, setEditText] = useState('')
  const [showGroupCallAlert, setShowGroupCallAlert] = useState(false)
  const [activeCall, setActiveCall] = useState<{ isVideo: boolean; isIncoming?: boolean; offer?: RTCSessionDescriptionInit; callMessageId?: string } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

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

  // Listen for incoming calls - show notification but don't auto-open modal
  useEffect(() => {
    if (chat.is_group) return

    const channel = supabase
      .channel(`call-incoming:${chat.id}`)
      .on('broadcast', { event: 'call-signal' }, ({ payload }) => {
        // Only handle offer if we're already in a call (joined via button)
        if (payload.from !== currentUserId && payload.type === 'offer' && activeCall?.isIncoming && !activeCall.offer) {
          setActiveCall(prev => prev ? { ...prev, offer: payload.offer } : null)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [chat.id, chat.is_group, currentUserId, activeCall])

  const handleCall = async (isVideo: boolean) => {
    if (chat.is_group) {
      setShowGroupCallAlert(true)
      return
    }
    
    // Create call message
    const { data: callMsg } = await supabase.from('messages').insert({
      chat_id: chat.id,
      sender_id: currentUserId,
      content: JSON.stringify({ status: 'calling', isVideo }),
      message_type: 'call',
    }).select().single()
    
    setActiveCall({ isVideo, isIncoming: false, callMessageId: callMsg?.id })
  }

  const joinCall = (message: Message) => {
    const callData = JSON.parse(message.content)
    if (callData.status === 'calling') {
      setActiveCall({ isVideo: callData.isVideo, isIncoming: true, callMessageId: message.id })
    }
  }

  const handleCallEnd = async (callInfo?: { duration: number; wasConnected: boolean; isVideo: boolean }) => {
    // Prevent multiple calls
    if (!activeCall) return
    
    const callMessageId = activeCall.callMessageId
    const wasIncoming = activeCall.isIncoming
    setActiveCall(null)
    
    if (callMessageId && callInfo) {
      let statusText = ''
      
      if (callInfo.wasConnected) {
        const mins = Math.floor(callInfo.duration / 60)
        const secs = callInfo.duration % 60
        const durationStr = mins > 0 ? `${mins} мин ${secs} сек` : `${secs} сек`
        statusText = `ended:${durationStr}`
      } else {
        statusText = wasIncoming ? 'declined' : 'no_answer'
      }

      // Update call message
      await supabase.from('messages').update({
        content: JSON.stringify({ status: statusText, isVideo: callInfo.isVideo }),
        updated_at: new Date().toISOString()
      }).eq('id', callMessageId)
      
      await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', chat.id)
    }
  }

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
          msg.id === updatedMsg.id ? { ...msg, ...updatedMsg } : msg
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

  const startEditMessage = (message: Message) => {
    setEditingMessage(message)
    setEditText(message.content)
  }

  const cancelEdit = () => {
    setEditingMessage(null)
    setEditText('')
  }

  const saveEdit = async () => {
    if (!editingMessage || !editText.trim()) return

    const { error } = await supabase
      .from('messages')
      .update({ content: editText.trim(), updated_at: new Date().toISOString() })
      .eq('id', editingMessage.id)

    if (!error) {
      setMessages(prev => prev.map(msg =>
        msg.id === editingMessage.id 
          ? { ...msg, content: editText.trim(), updated_at: new Date().toISOString() }
          : msg
      ))
    }

    cancelEdit()
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
          <button 
            onClick={() => handleCall(false)}
            className="p-2 hover:bg-dark-100 rounded-full transition-colors"
          >
            <Phone className="w-5 h-5 text-gray-400" />
          </button>
          <button 
            onClick={() => handleCall(true)}
            className="p-2 hover:bg-dark-100 rounded-full transition-colors"
          >
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
                    className="w-full px-4 py-2 text-left text-white hover:bg-dark-100 flex items-center gap-3"
                  >
                    <Users className="w-5 h-5 text-gray-400" />
                    Информация о группе
                  </button>
                ) : otherProfile && (
                  <button
                    onClick={() => { setViewProfile(otherProfile); setShowDropdown(false) }}
                    className="w-full px-4 py-2 text-left text-white hover:bg-dark-100 flex items-center gap-3"
                  >
                    <User className="w-5 h-5 text-gray-400" />
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
            const isEdited = message.updated_at && message.updated_at !== message.created_at

            return (
              <div
                key={message.id}
                className={clsx('flex gap-2 message-enter group', isOwn ? 'justify-end' : 'justify-start')}
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
                    'max-w-[70%] rounded-2xl px-4 py-2 relative',
                    isOwn
                      ? 'bg-primary-600 text-white rounded-br-md'
                      : 'bg-dark-100 text-gray-100 rounded-bl-md'
                  )}
                >
                  {isOwn && message.message_type === 'text' && (
                    <button
                      onClick={() => startEditMessage(message)}
                      className="absolute -left-7 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 hover:bg-dark-100 rounded transition-opacity"
                      title="Редактировать"
                    >
                      <Pencil className="w-4 h-4 text-gray-500" />
                    </button>
                  )}
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
                  {message.message_type === 'call' && (() => {
                    const callData = JSON.parse(message.content)
                    const isCalling = callData.status === 'calling'
                    const isEnded = callData.status?.startsWith('ended:')
                    const duration = isEnded ? callData.status.split(':')[1] : null
                    const isDeclined = callData.status === 'declined'
                    const isNoAnswer = callData.status === 'no_answer'
                    
                    return (
                      <div className={clsx(
                        'flex items-center gap-3 p-2 rounded-lg',
                        isOwn ? 'bg-primary-700' : 'bg-dark-200'
                      )}>
                        <div className={clsx(
                          'w-10 h-10 rounded-full flex items-center justify-center',
                          isCalling ? 'bg-green-600 animate-pulse' : 'bg-dark-100'
                        )}>
                          {callData.isVideo ? <Video className="w-5 h-5 text-white" /> : <Phone className="w-5 h-5 text-white" />}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {isCalling && (isOwn ? 'Звоним...' : 'Входящий звонок')}
                            {isEnded && `${callData.isVideo ? 'Видеозвонок' : 'Звонок'} • ${duration}`}
                            {isDeclined && 'Звонок отклонён'}
                            {isNoAnswer && 'Нет ответа'}
                          </p>
                        </div>
                        {isCalling && !isOwn && !activeCall && (
                          <button
                            onClick={() => joinCall(message)}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg flex items-center gap-1"
                          >
                            <PhoneCall className="w-4 h-4" />
                            Принять
                          </button>
                        )}
                      </div>
                    )
                  })()}
                  {message.message_type === 'text' && <p className="break-words whitespace-pre-wrap">{message.content}</p>}
                  <div className={clsx('flex items-center gap-1 mt-1', isOwn ? 'justify-end' : 'justify-start')}>
                    {isEdited && (
                      <span className={clsx('text-xs', isOwn ? 'text-primary-300' : 'text-gray-500')}>ред.</span>
                    )}
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

      {/* Edit Message Bar */}
      {editingMessage && (
        <div className="px-4 py-2 bg-dark-200 border-t border-dark-50 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-primary-500 font-medium">Редактирование</p>
            <p className="text-sm text-gray-400 truncate">{editingMessage.content}</p>
          </div>
          <button onClick={cancelEdit} className="p-1 hover:bg-dark-100 rounded">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      )}

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
      <form onSubmit={editingMessage ? (e) => { e.preventDefault(); saveEdit() } : sendMessage} className="bg-dark-200 border-t border-dark-50 p-4">
        <div className="flex items-center gap-2">
          {!editingMessage && (
            <>
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
            </>
          )}
          <input
            type="text"
            value={editingMessage ? editText : newMessage}
            onChange={(e) => editingMessage ? setEditText(e.target.value) : setNewMessage(e.target.value)}
            placeholder={editingMessage ? "Редактировать сообщение..." : "Написать сообщение..."}
            className="flex-1 px-4 py-2 bg-dark-300 border border-dark-50 text-white rounded-full focus:ring-2 focus:ring-primary-500 placeholder-gray-500"
          />
          <button
            type="submit"
            disabled={editingMessage ? !editText.trim() : ((!newMessage.trim() && !selectedFile) || sending)}
            className="p-2 bg-primary-600 hover:bg-primary-700 text-white rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {editingMessage ? <Check className="w-5 h-5" /> : <Send className="w-5 h-5" />}
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

      {showGroupCallAlert && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-200 border border-dark-50 rounded-2xl p-6 max-w-sm w-full text-center">
            <div className="w-16 h-16 bg-primary-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-primary-500" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Звонки недоступны</h3>
            <p className="text-gray-400 mb-4">Звонки в групповых чатах пока не поддерживаются</p>
            <button
              onClick={() => setShowGroupCallAlert(false)}
              className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-colors"
            >
              Понятно
            </button>
          </div>
        </div>
      )}

      {activeCall && otherProfile && (
        <CallModal
          chatId={chat.id}
          currentUserId={currentUserId}
          otherUser={otherProfile}
          isVideoCall={activeCall.isVideo}
          isIncoming={activeCall.isIncoming}
          incomingOffer={activeCall.offer}
          onClose={handleCallEnd}
        />
      )}
    </div>
  )
}
