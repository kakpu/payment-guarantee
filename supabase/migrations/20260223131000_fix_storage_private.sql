/*
  # Storageバケットをprivateに変更

  書類画像は個人情報（本人確認書類）であるため、
  publicバケットからprivateバケットに変更し、
  署名付きURLでのアクセスに統一する。
*/

UPDATE storage.buckets
SET public = false
WHERE id = 'documents';
