# データベース設計

## テーブル一覧

- **documents**: 書類のメタデータ（種別・画像URL・ステータス）を管理
- **document_data**: OCR抽出結果（氏名・生年月日・住所）を管理
- **document_history**: 書類に対するすべての操作履歴を記録（監査対応）
- **batch_exports**: 日次バッチ実行の結果サマリを管理
- **batch_export_items**: バッチエクスポートに含まれる書類の明細を管理

> `auth.users` は Supabase Auth が管理するため、DDL定義不要。

---

## 主要テーブル DDL

### documents テーブル

```sql
CREATE TABLE documents (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type   TEXT        NOT NULL CHECK (document_type IN ('mynumber_card', 'drivers_license')),
  image_url       TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'uploaded'
                              CHECK (status IN (
                                'uploaded',       -- アップロード済み
                                'ocr_processing', -- OCR処理中
                                'ocr_completed',  -- OCR完了・確認待ち
                                'confirmed',      -- 確認OK確定
                                'rejected'        -- 差戻し
                              )),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_status  ON documents(status);

-- RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "自分の書類のみ閲覧可能"
  ON documents FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "自分の書類のみ作成可能"
  ON documents FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "自分の書類のみ更新可能"
  ON documents FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
```

---

### document_data テーブル

```sql
CREATE TABLE document_data (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      UUID        NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
  name             TEXT,                          -- 氏名（OCR抽出・未完了時はNULL）
  birth_date       DATE,                          -- 生年月日
  address          TEXT,                          -- 住所
  ocr_executed_at  TIMESTAMPTZ,                   -- OCR実行日時（監査用）
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS（documentsを経由してアクセス制御）
ALTER TABLE document_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "自分の書類データのみ閲覧可能"
  ON document_data FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_data.document_id
        AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "自分の書類データのみ作成可能"
  ON document_data FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_data.document_id
        AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "自分の書類データのみ更新可能"
  ON document_data FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_data.document_id
        AND documents.user_id = auth.uid()
    )
  );
```

---

### document_history テーブル

```sql
-- action の種別
-- 'uploaded'      : アップロード
-- 'ocr_completed' : OCR完了
-- 'modified'      : データ修正
-- 'confirmed'     : 確認OK確定
-- 'rejected'      : 差戻し
CREATE TABLE document_history (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  operator_id  UUID        NOT NULL REFERENCES auth.users(id),
  action       TEXT        NOT NULL CHECK (action IN (
                             'uploaded', 'ocr_completed', 'modified', 'confirmed', 'rejected'
                           )),
  changes      JSONB       NOT NULL DEFAULT '{}',
  -- changes の形式例: {"old": {"name": "山田太郎"}, "new": {"name": "山田 太郎"}}
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX idx_document_history_document_id ON document_history(document_id);
CREATE INDEX idx_document_history_operator_id ON document_history(operator_id);

-- RLS
ALTER TABLE document_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "自分の書類の履歴のみ閲覧可能"
  ON document_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_history.document_id
        AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "自分の書類への履歴のみ記録可能"
  ON document_history FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = operator_id AND
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_history.document_id
        AND documents.user_id = auth.uid()
    )
  );
```

---

### batch_exports テーブル

```sql
CREATE TABLE batch_exports (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  executed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  document_count  INTEGER     NOT NULL DEFAULT 0,
  status          TEXT        NOT NULL CHECK (status IN ('success', 'failed')),
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS（将来の管理者ロール導入まではauthenticatedユーザーが閲覧可能）
ALTER TABLE batch_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "認証ユーザーはバッチ履歴を閲覧可能"
  ON batch_exports FOR SELECT TO authenticated
  USING (true);
```

---

### batch_export_items テーブル

```sql
CREATE TABLE batch_export_items (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_export_id  UUID        NOT NULL REFERENCES batch_exports(id) ON DELETE CASCADE,
  document_id      UUID        NOT NULL REFERENCES documents(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX idx_batch_export_items_batch_id     ON batch_export_items(batch_export_id);
CREATE INDEX idx_batch_export_items_document_id  ON batch_export_items(document_id);

-- RLS
ALTER TABLE batch_export_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "認証ユーザーはバッチ明細を閲覧可能"
  ON batch_export_items FOR SELECT TO authenticated
  USING (true);
```

---

## リレーション

| From | To | 関連性 |
|---|---|---|
| `documents.user_id` | `auth.users.id` | 多対一（書類はユーザーに紐づく） |
| `document_data.document_id` | `documents.id` | 一対一（書類1件につきOCRデータ1件） |
| `document_history.document_id` | `documents.id` | 多対一（書類に複数の操作履歴） |
| `document_history.operator_id` | `auth.users.id` | 多対一（操作者はユーザーに紐づく） |
| `batch_export_items.batch_export_id` | `batch_exports.id` | 多対一（バッチ1回に複数書類） |
| `batch_export_items.document_id` | `documents.id` | 多対一（書類は複数バッチに含まれる可能性あり） |

---

## ステータス遷移

```
uploaded → ocr_processing → ocr_completed → confirmed
                                          ↘ rejected
```

| ステータス | 意味 |
|---|---|
| `uploaded` | アップロード直後、OCR未実行 |
| `ocr_processing` | OCR処理中 |
| `ocr_completed` | OCR完了、オペレーターによる確認待ち |
| `confirmed` | 確認OK確定（バッチ連携対象） |
| `rejected` | 差戻し済み |

---

## ストレージ設計

### バケット一覧

| バケット名 | 公開設定 | 用途 |
|---|---|---|
| `documents` | private | 本人確認書類の画像（マイナンバーカード・運転免許証） |
| `batch-exports` | private | 日次バッチ CSV（`{YYYY-MM-DD}.csv`） |

### `documents` バケット詳細

| 項目 | 値 |
|---|---|
| パス構成 | `{user_id}/{timestamp}.{ext}` |
| 対応形式 | PNG, JPG, JPEG |
| 最大ファイルサイズ | 5MB |
| アクセス方式 | **署名付きURL**（有効期限1時間）。公開URLは発行しない |
| DB保存値 | オブジェクトキー（パス）のみ。URLは保存しない |

```sql
-- Supabase Storage RLS（documents バケット）
CREATE POLICY "自分のフォルダにのみアップロード可能"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "自分のファイルのみ閲覧可能（署名付きURL発行に必要）"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
```

### `batch-exports` バケット詳細

| 項目 | 値 |
|---|---|
| パス構成 | `{YYYY-MM-DD}.csv` |
| 書き込み権限 | service_role のみ（Edge Function から書き込む） |
| 読み取り権限 | 認証済みユーザー（将来の管理者画面対応を想定） |

```sql
-- Supabase Storage RLS（batch-exports バケット）
CREATE POLICY "認証済みユーザーはバッチCSVを閲覧可能"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'batch-exports');
```
