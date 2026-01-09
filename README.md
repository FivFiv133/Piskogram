# Piskogram 💬

Современный мессенджер на Next.js + Supabase

## Функции

- ✅ Регистрация и авторизация (email/password)
- ✅ Личные чаты
- ✅ Групповые чаты
- ✅ Realtime сообщения
- ✅ Отправка изображений и файлов
- ✅ Статус онлайн/офлайн
- ✅ Аватары пользователей
- ✅ Непрочитанные сообщения
- ✅ Адаптивный дизайн (mobile/desktop)

## Deploy на Vercel

### 1. Push в GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/piskogram.git
git push -u origin main
```

### 2. Импорт в Vercel

1. Зайди на [vercel.com](https://vercel.com)
2. Нажми "Add New" → "Project"
3. Импортируй репозиторий из GitHub
4. В настройках добавь Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = твой URL из Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = твой anon key из Supabase
5. Нажми "Deploy"

### 3. Готово!

После деплоя получишь URL типа `https://piskogram.vercel.app`

## Локальная разработка

```bash
npm install
npm run dev
```

## Supabase Setup

1. Создай проект на [supabase.com](https://supabase.com)
2. SQL Editor → выполни `supabase-schema.sql`
3. Storage → создай buckets: `avatars` и `chat-files` (public)
4. Authentication → Settings → отключи "Confirm email"
