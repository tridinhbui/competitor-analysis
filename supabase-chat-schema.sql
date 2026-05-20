-- ============================================================
-- Chat persistence schema — run in Supabase SQL Editor
-- ============================================================

-- Chat threads table
CREATE TABLE IF NOT EXISTS chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'general' CHECK (kind IN ('general', 'data-source-workbook')),
  title TEXT NOT NULL DEFAULT 'New chat',
  company_ticker TEXT,
  company_name TEXT,
  source_thread_id UUID REFERENCES chat_threads(id) ON DELETE SET NULL,
  workbook_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chat_threads
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'general';
ALTER TABLE chat_threads
  ADD COLUMN IF NOT EXISTS company_ticker TEXT;
ALTER TABLE chat_threads
  ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE chat_threads
  ADD COLUMN IF NOT EXISTS source_thread_id UUID REFERENCES chat_threads(id) ON DELETE SET NULL;
ALTER TABLE chat_threads
  ADD COLUMN IF NOT EXISTS workbook_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_chat_threads_user_updated
  ON chat_threads(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_threads_user_kind_company_updated
  ON chat_threads(user_id, kind, company_ticker, updated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chat_threads_kind_check'
  ) THEN
    ALTER TABLE chat_threads
      ADD CONSTRAINT chat_threads_kind_check
      CHECK (kind IN ('general', 'data-source-workbook'));
  END IF;
END $$;

-- Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created
  ON chat_messages(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created
  ON chat_messages(user_id, created_at DESC);

-- ============================================================
-- Row Level Security — owner-only
-- ============================================================
ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_threads' AND policyname='chat_threads_owner') THEN
    CREATE POLICY "chat_threads_owner" ON chat_threads
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_messages' AND policyname='chat_messages_owner') THEN
    CREATE POLICY "chat_messages_owner" ON chat_messages
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Verify
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('chat_threads', 'chat_messages');
