export interface Profile {
  id: string
  email: string
  username: string
  avatar_url: string | null
  status: 'online' | 'offline' | 'away'
  last_seen: string
  created_at: string
}

export interface Chat {
  id: string
  name: string | null
  is_group: boolean
  created_at: string
  updated_at: string
}

export interface ChatParticipant {
  id: string
  chat_id: string
  user_id: string
  joined_at: string
}

export interface Message {
  id: string
  chat_id: string
  sender_id: string
  content: string
  message_type: 'text' | 'image' | 'file'
  file_url: string | null
  is_read: boolean
  created_at: string
  updated_at: string
  sender?: Profile
}

export interface ChatWithDetails extends Chat {
  participants: (ChatParticipant & { profile: Profile })[]
  last_message?: Message
  unread_count?: number
}
