# API設計ドキュメント

## 概要

このアプリケーションは Supabase の PostgREST API を使用しており、RESTful な操作が可能です。すべてのエンドポイントは認証が必要で、Row Level Security (RLS) により自動的にアクセス制御されます。

## 認証

### ヘッダー

すべてのリクエストには以下のヘッダーが必要です：

```
Authorization: Bearer {access_token}
apikey: {supabase_anon_key}
Content-Type: application/json
```

## エンドポイント

### 認証関連

#### サインアップ

**POST** `/auth/v1/signup`

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**レスポンス例**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

#### ログイン

**POST** `/auth/v1/token?grant_type=password`

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**レスポンス例**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "...",
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

#### ログアウト

**POST** `/auth/v1/logout`

**レスポンス**: 204 No Content

---

### 書類（Documents）関連

#### 書類一覧取得

**GET** `/rest/v1/documents`

**認証**: 必要

**説明**: ログインユーザーの書類一覧を取得

**クエリパラメータ**:
- `select=*`: 取得するカラムを指定
- `order=created_at.desc`: ソート順
- `status=eq.uploaded`: ステータスでフィルタ

**リクエスト例**:
```
GET /rest/v1/documents?select=*&order=created_at.desc
Authorization: Bearer {token}
apikey: {anon_key}
```

**レスポンス例**:
```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "document_type": "mynumber_card",
    "image_url": "https://...",
    "status": "uploaded",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
]
```

**エラー**:
- `401 Unauthorized`: 認証トークンが無効
- `403 Forbidden`: アクセス権限なし

#### 書類詳細取得

**GET** `/rest/v1/documents?id=eq.{document_id}&select=*`

**認証**: 必要

**説明**: 特定の書類の詳細を取得

**レスポンス例**:
```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "document_type": "drivers_license",
    "image_url": "https://...",
    "status": "confirmed",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T12:00:00Z"
  }
]
```

#### 書類作成

**POST** `/rest/v1/documents`

**認証**: 必要

**説明**: 新しい書類を登録

**リクエスト例**:
```json
{
  "user_id": "uuid",
  "document_type": "mynumber_card",
  "image_url": "https://...",
  "status": "uploaded"
}
```

**レスポンス例**:
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "document_type": "mynumber_card",
  "image_url": "https://...",
  "status": "uploaded",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

#### 書類ステータス更新

**PATCH** `/rest/v1/documents?id=eq.{document_id}`

**認証**: 必要

**説明**: 書類のステータスを更新

**リクエスト例**:
```json
{
  "status": "confirmed",
  "updated_at": "2024-01-01T12:00:00Z"
}
```

**レスポンス**: 204 No Content

---

### 書類データ（Document Data）関連

#### 書類データ取得

**GET** `/rest/v1/document_data?document_id=eq.{document_id}`

**認証**: 必要

**説明**: 書類のOCR抽出データを取得

**レスポンス例**:
```json
[
  {
    "id": "uuid",
    "document_id": "uuid",
    "name": "山田 太郎",
    "birth_date": "1990-01-01",
    "address": "東京都千代田区...",
    "ocr_executed_at": "2024-01-01T00:05:00Z",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
]
```

#### 書類データ更新

**PATCH** `/rest/v1/document_data?document_id=eq.{document_id}`

**認証**: 必要

**説明**: OCR抽出データを修正

**リクエスト例**:
```json
{
  "name": "山田 太郎",
  "birth_date": "1990-01-01",
  "address": "東京都千代田区...",
  "updated_at": "2024-01-01T12:00:00Z"
}
```

**レスポンス**: 204 No Content

---

### 履歴（Document History）関連

#### 履歴一覧取得

**GET** `/rest/v1/document_history?document_id=eq.{document_id}&order=created_at.desc`

**認証**: 必要

**説明**: 書類の操作履歴を取得

**レスポンス例**:
```json
[
  {
    "id": "uuid",
    "document_id": "uuid",
    "operator_id": "uuid",
    "action": "confirmed",
    "changes": {},
    "created_at": "2024-01-01T12:00:00Z"
  },
  {
    "id": "uuid",
    "document_id": "uuid",
    "operator_id": "uuid",
    "action": "modified",
    "changes": {
      "old": {
        "name": "山田太郎",
        "birth_date": "1990-01-01",
        "address": "東京都..."
      },
      "new": {
        "name": "山田 太郎",
        "birth_date": "1990-01-01",
        "address": "東京都千代田区..."
      }
    },
    "created_at": "2024-01-01T11:00:00Z"
  }
]
```

#### 履歴追加

**POST** `/rest/v1/document_history`

**認証**: 必要

**説明**: 新しい操作履歴を記録

**リクエスト例**:
```json
{
  "document_id": "uuid",
  "operator_id": "uuid",
  "action": "modified",
  "changes": {
    "old": { "name": "..." },
    "new": { "name": "..." }
  }
}
```

**レスポンス例**:
```json
{
  "id": "uuid",
  "document_id": "uuid",
  "operator_id": "uuid",
  "action": "modified",
  "changes": { ... },
  "created_at": "2024-01-01T12:00:00Z"
}
```

---

### ストレージ（Storage）関連

#### ファイルアップロード

**POST** `/storage/v1/object/documents/{user_id}/{filename}`

**認証**: 必要

**説明**: 書類画像をアップロード

**リクエスト**:
- Content-Type: multipart/form-data
- Body: 画像ファイル

**レスポンス例**:
```json
{
  "Key": "documents/uuid/1234567890.jpg",
  "Id": "uuid"
}
```

#### 署名付きURL取得

**POST** `/storage/v1/object/sign/documents/{user_id}/{filename}`

**認証**: 必要（`documents` バケットは private）

**説明**: アップロードした画像への時限付きアクセスURLを発行する。
有効期限は 3600 秒（1時間）。期限切れ後は再発行が必要。

**リクエスト例（Supabase クライアント）**:
```typescript
const { data, error } = await supabase.storage
  .from('documents')
  .createSignedUrl(objectKey, 3600);
// data.signedUrl を <img src> に渡す
```

**レスポンス例**:
```json
{
  "signedURL": "https://ckdofopojlxqdnerxmdk.supabase.co/storage/v1/object/sign/documents/..."
}
```

> **注意**: DB の `documents.image_url` にはオブジェクトキー（パス）のみ保存する。
> 公開URL・署名付きURL を DB に保存してはならない。

---

### バッチエクスポート（Batch Exports）関連

#### バッチエクスポート一覧取得

**GET** `/rest/v1/batch_exports?order=executed_at.desc`

**認証**: 必要

**説明**: バッチ連携履歴を取得

**レスポンス例**:
```json
[
  {
    "id": "uuid",
    "executed_at": "2024-01-01T20:00:00Z",
    "document_count": 15,
    "status": "success",
    "error_message": null,
    "created_at": "2024-01-01T20:00:00Z"
  }
]
```

#### バッチエクスポート詳細取得

**GET** `/rest/v1/batch_export_items?batch_export_id=eq.{batch_id}`

**認証**: 必要

**説明**: バッチエクスポートに含まれる書類一覧を取得

**レスポンス例**:
```json
[
  {
    "id": "uuid",
    "batch_export_id": "uuid",
    "document_id": "uuid",
    "created_at": "2024-01-01T20:00:00Z"
  }
]
```

---

## エラーレスポンス

すべてのエラーは統一されたフォーマットで返されます：

```json
{
  "code": "error_code",
  "message": "エラーメッセージ",
  "details": "詳細情報（任意）",
  "hint": "解決方法のヒント（任意）"
}
```

### 主なエラーコード

- `400 Bad Request`: リクエストが不正
- `401 Unauthorized`: 認証が必要
- `403 Forbidden`: アクセス権限なし
- `404 Not Found`: リソースが見つからない
- `409 Conflict`: リソースの競合
- `422 Unprocessable Entity`: バリデーションエラー
- `500 Internal Server Error`: サーバーエラー

---

## レート制限

Supabase Free Tier の制限:
- API リクエスト: 無制限（ただし、同時接続数に制限あり）
- ストレージアップロード: 50MB/ファイル

Supabase Pro プランの制限:
- API リクエスト: 無制限
- ストレージアップロード: 5GB/ファイル

---

## 将来のAPI拡張予定

### OCR処理エンドポイント

**POST** `/functions/v1/ocr-extract`

**説明**: Edge Function経由でOCR APIを呼び出し

```json
{
  "document_id": "uuid",
  "image_url": "https://..."
}
```

### バッチエクスポートエンドポイント

**POST** `/functions/v1/batch-export`

**説明**: 確認済み書類をバッチエクスポート

```json
{
  "date": "2024-01-01"
}
```

---

## 使用例（JavaScript/TypeScript）

### 書類一覧取得

```typescript
const { data, error } = await supabase
  .from('documents')
  .select('*')
  .order('created_at', { ascending: false });
```

### 書類詳細取得

```typescript
const { data, error } = await supabase
  .from('documents')
  .select(`
    *,
    document_data (*)
  `)
  .eq('id', documentId)
  .single();
```

### 書類ステータス更新

```typescript
const { error } = await supabase
  .from('documents')
  .update({
    status: 'confirmed',
    updated_at: new Date().toISOString()
  })
  .eq('id', documentId);
```

### ファイルアップロード

```typescript
const { data, error } = await supabase.storage
  .from('documents')
  .upload(`${userId}/${Date.now()}.jpg`, file);
```
