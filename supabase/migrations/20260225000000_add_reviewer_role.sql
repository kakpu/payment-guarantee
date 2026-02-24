/*
  # 再鑑機能追加マイグレーション

  1. 新規テーブル
    - `user_roles` — ユーザーのロール（operator / reviewer）を管理

  2. CHECK 制約の更新
    - `documents.status` に reviewed / review_rejected を追加
    - `document_history.action` に reviewed / review_rejected を追加

  3. RLS ポリシーの追加（既存ポリシーは変更しない）
    - 再鑑者は全書類・全書類データ・全履歴を閲覧可能
    - 再鑑者は documents.status を reviewed / review_rejected に更新可能
    - 再鑑者は自分の操作を document_history に記録可能
    - 再鑑者は Storage の全書類画像を閲覧可能（署名付きURL発行のため）
*/

-- -----------------------------------------------
-- 1. user_roles テーブル作成
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS user_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('operator', 'reviewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- 自分のロールのみ参照可能（INSERT/UPDATE/DELETE は SQL 手動操作のみ）
CREATE POLICY "自分のロールのみ閲覧可能"
  ON user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- -----------------------------------------------
-- 2. documents.status の CHECK 制約を更新
--    reviewed / review_rejected を追加
-- -----------------------------------------------
ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_status_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_status_check
  CHECK (status IN (
    'uploaded',
    'ocr_processing',
    'ocr_completed',
    'confirmed',
    'rejected',
    'reviewed',        -- 再鑑OK（再鑑者が承認）
    'review_rejected'  -- 再鑑差戻し（再鑑者が差戻し）
  ));

-- -----------------------------------------------
-- 3. document_history.action の CHECK 制約を更新
-- -----------------------------------------------
ALTER TABLE document_history
  DROP CONSTRAINT IF EXISTS document_history_action_check;

ALTER TABLE document_history
  ADD CONSTRAINT document_history_action_check
  CHECK (action IN (
    'uploaded',
    'ocr_extracted',
    'confirmed',
    'rejected',
    'modified',
    'reviewed',        -- 再鑑OK
    'review_rejected'  -- 再鑑差戻し
  ));

-- -----------------------------------------------
-- 4. documents: 再鑑者用 SELECT ポリシー
--    ※ 既存「自分の書類のみ」ポリシーと OR 条件で共存
-- -----------------------------------------------
CREATE POLICY "再鑑者は全書類を閲覧可能"
  ON documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'reviewer'
    )
  );

-- -----------------------------------------------
-- 5. documents: 再鑑者用 UPDATE ポリシー
--    reviewed / review_rejected への更新のみ許可
-- -----------------------------------------------
CREATE POLICY "再鑑者はステータスを再鑑結果に更新可能"
  ON documents FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'reviewer'
    )
  )
  WITH CHECK (
    status IN ('reviewed', 'review_rejected') AND
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'reviewer'
    )
  );

-- -----------------------------------------------
-- 6. document_data: 再鑑者用 SELECT ポリシー
-- -----------------------------------------------
CREATE POLICY "再鑑者は全書類データを閲覧可能"
  ON document_data FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'reviewer'
    )
  );

-- -----------------------------------------------
-- 7. document_history: 再鑑者用 SELECT ポリシー
-- -----------------------------------------------
CREATE POLICY "再鑑者は全書類の履歴を閲覧可能"
  ON document_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'reviewer'
    )
  );

-- -----------------------------------------------
-- 8. document_history: 再鑑者用 INSERT ポリシー
-- -----------------------------------------------
CREATE POLICY "再鑑者は自分の履歴を記録可能"
  ON document_history FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = operator_id AND
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'reviewer'
    )
  );

-- -----------------------------------------------
-- 9. Storage: 再鑑者用 SELECT ポリシー
--    他ユーザーの書類画像の署名付きURL発行に必要
-- -----------------------------------------------
CREATE POLICY "再鑑者は全書類画像を閲覧可能"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents' AND
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'reviewer'
    )
  );

/*
  ロール割り当て手順（初期運用は以下の SQL を Supabase SQL Editor で手動実行）:

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('<対象ユーザーのUUID>', 'reviewer');
*/
