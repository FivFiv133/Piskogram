'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { MessageCircle, Mail, Lock, Loader2 } from 'lucide-react'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError('Неверный email или пароль')
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-dark-300 via-dark-400 to-dark-500 flex items-center justify-center p-4">
      <div className="bg-dark-200 border border-dark-50 rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-900/50 rounded-full mb-4">
            <MessageCircle className="w-8 h-8 text-primary-500" />
          </div>
          <h1 className="text-2xl font-bold text-white">Piskogram</h1>
          <p className="text-gray-400 mt-2">Войдите в свой аккаунт</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-dark-300 border border-dark-50 text-white rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all placeholder-gray-500"
                placeholder="your@email.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Пароль</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-dark-300 border border-dark-50 text-white rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all placeholder-gray-500"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {error && (
            <div className="bg-primary-900/30 border border-primary-800 text-primary-400 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Вход...
              </>
            ) : (
              'Войти'
            )}
          </button>
        </form>

        <p className="text-center text-gray-400 mt-6">
          Нет аккаунта?{' '}
          <Link href="/auth/register" className="text-primary-500 hover:text-primary-400 font-medium">
            Зарегистрироваться
          </Link>
        </p>
      </div>
    </div>
  )
}
