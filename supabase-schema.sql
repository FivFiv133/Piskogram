-- Piskogram Database Schema for Supabase
-- Run this in Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles table
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  username text not null,
  avatar_url text,
  status text default 'offline' check (status in ('online', 'offline', 'away')),
  last_seen timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);

-- Chats table
create table public.chats (
  id uuid default uuid_generate_v4() primary key,
  name text,
  is_group boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Chat participants table
create table public.chat_participants (
  id uuid default uuid_generate_v4() primary key,
  chat_id uuid references public.chats on delete cascade not null,
  user_id uuid references public.profiles on delete cascade not null,
  joined_at timestamp with time zone default now(),
  unique(chat_id, user_id)
);

-- Messages table
create table public.messages (
  id uuid default uuid_generate_v4() primary key,
  chat_id uuid references public.chats on delete cascade not null,
  sender_id uuid references public.profiles on delete cascade not null,
  content text not null,
  message_type text default 'text' check (message_type in ('text', 'image', 'file')),
  file_url text,
  is_read boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Indexes for better performance
create index idx_messages_chat_id on public.messages(chat_id);
create index idx_messages_sender_id on public.messages(sender_id);
create index idx_messages_created_at on public.messages(created_at);
create index idx_chat_participants_user_id on public.chat_participants(user_id);
create index idx_chat_participants_chat_id on public.chat_participants(chat_id);
create index idx_profiles_status on public.profiles(status);

-- Enable Row Level Security
alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.chat_participants enable row level security;
alter table public.messages enable row level security;

-- RLS Policies for profiles
create policy "Public profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- RLS Policies for chats
create policy "Users can view chats they participate in"
  on public.chats for select
  using (
    exists (
      select 1 from public.chat_participants
      where chat_participants.chat_id = chats.id
      and chat_participants.user_id = auth.uid()
    )
  );

create policy "Authenticated users can create chats"
  on public.chats for insert
  with check (auth.role() = 'authenticated');

create policy "Chat participants can update chat"
  on public.chats for update
  using (
    exists (
      select 1 from public.chat_participants
      where chat_participants.chat_id = chats.id
      and chat_participants.user_id = auth.uid()
    )
  );

-- RLS Policies for chat_participants
create policy "Users can view participants of their chats"
  on public.chat_participants for select
  using (
    exists (
      select 1 from public.chat_participants cp
      where cp.chat_id = chat_participants.chat_id
      and cp.user_id = auth.uid()
    )
  );

create policy "Authenticated users can add participants"
  on public.chat_participants for insert
  with check (auth.role() = 'authenticated');

-- RLS Policies for messages
create policy "Users can view messages in their chats"
  on public.messages for select
  using (
    exists (
      select 1 from public.chat_participants
      where chat_participants.chat_id = messages.chat_id
      and chat_participants.user_id = auth.uid()
    )
  );

create policy "Users can send messages to their chats"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.chat_participants
      where chat_participants.chat_id = messages.chat_id
      and chat_participants.user_id = auth.uid()
    )
  );

create policy "Users can update messages in their chats"
  on public.messages for update
  using (
    exists (
      select 1 from public.chat_participants
      where chat_participants.chat_id = messages.chat_id
      and chat_participants.user_id = auth.uid()
    )
  );

-- Enable Realtime for messages
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.chats;
alter publication supabase_realtime add table public.profiles;

-- Storage buckets (run these separately or via Supabase Dashboard)
-- insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);
-- insert into storage.buckets (id, name, public) values ('chat-files', 'chat-files', true);

-- Storage policies for avatars bucket
-- create policy "Avatar images are publicly accessible"
--   on storage.objects for select
--   using (bucket_id = 'avatars');

-- create policy "Users can upload their own avatar"
--   on storage.objects for insert
--   with check (bucket_id = 'avatars' and auth.role() = 'authenticated');

-- create policy "Users can update their own avatar"
--   on storage.objects for update
--   using (bucket_id = 'avatars' and auth.role() = 'authenticated');

-- Storage policies for chat-files bucket
-- create policy "Chat files are publicly accessible"
--   on storage.objects for select
--   using (bucket_id = 'chat-files');

-- create policy "Authenticated users can upload chat files"
--   on storage.objects for insert
--   with check (bucket_id = 'chat-files' and auth.role() = 'authenticated');
