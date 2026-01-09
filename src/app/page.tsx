import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MainChat from '@/components/MainChat'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/auth/login')
  }

  // Update status to online
  await supabase
    .from('profiles')
    .update({ status: 'online', last_seen: new Date().toISOString() })
    .eq('id', user.id)

  return <MainChat initialProfile={profile} />
}
