-- document_data に OCR エラーメッセージカラムを追加
-- OCR 失敗時（上限超過・API エラー等）のエラー内容を記録する
ALTER TABLE document_data
  ADD COLUMN IF NOT EXISTS ocr_error_message TEXT;
