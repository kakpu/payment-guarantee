/*
  # batch-exports Storageバケットを作成

  バッチCSVファイルを保存するためのprivateバケット。
  認証済みユーザーが閲覧可能（将来の管理者画面対応を考慮）。
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('batch-exports', 'batch-exports', false)
ON CONFLICT (id) DO NOTHING;

-- 認証済みユーザーはCSVファイルを閲覧可能
CREATE POLICY "認証済みユーザーはバッチCSVを閲覧可能"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'batch-exports');
