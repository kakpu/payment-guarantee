/*
  # profiles テーブル作成

  操作履歴にユーザー名（メールアドレス）を表示するため、
  auth.users のメールアドレスを保持する profiles テーブルを作成する。

  1. 新規テーブル
    - `profiles` — ユーザーのメールアドレスを管理（auth.users と 1:1）

  2. トリガー
    - 新規ユーザー作成時に profiles へ自動挿入

  3. RLS
    - 認証済みユーザーは全プロフィールを参照可
      （再鑑者がオペレーターの名前を確認する用途上、全件参照を許可）
    - INSERT/UPDATE/DELETE はアプリ層から不可（トリガーのみ）

  4. バックフィル
    - 既存ユーザーを一括挿入
*/

-- -----------------------------------------------
-- 1. profiles テーブル作成
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_id ON profiles(id);

-- -----------------------------------------------
-- 2. RLS 設定
-- -----------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは全プロフィールを参照可
CREATE POLICY "認証済みユーザーはプロフィールを閲覧可能"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- -----------------------------------------------
-- 3. 新規ユーザー作成時に自動挿入するトリガー
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------
-- 4. 既存ユーザーをバックフィル
-- -----------------------------------------------
INSERT INTO public.profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;
