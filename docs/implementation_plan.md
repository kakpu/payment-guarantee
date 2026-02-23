# 実装計画

---

## 概要

代弁実行（保証審査）書類取込・確認アプリの MVP 実装計画。
地銀オペレーターが本人確認書類を取り込み、確定データを日次バッチで連携するシステム。

---

## 設計上の決定事項（初期確認事項）

実装開始前に確定した4つの設計方針:

| # | 決定事項 | 内容 |
|---|---|---|
| 1 | OCR | **将来機能**とする。MVP では手動入力のみ |
| 2 | バッチ出力形式 | **CSV ファイル**を `batch-exports` Storage バケットへ保存 |
| 3 | バッチ実行方法 | **GitHub Actions** cron（毎日 JST 20:00 = UTC 11:00） |
| 4 | 書類画像の保管 | **プライベート Storage + 署名付きURL**（有効期限1時間） |

---

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | React 18.3 + TypeScript 5.5 + Tailwind CSS 3.4 + Vite 5.4 |
| フロントエンドホスティング | **Vercel**（CDN・自動デプロイ・プレビュー環境） |
| バックエンド | Supabase（PostgreSQL + Auth + Storage + Edge Functions） |
| 認証 | Supabase Auth（Email/Password） |
| バッチ実行 | GitHub Actions + Supabase Edge Function（Deno） |
| アイコン | Lucide React |

---

## 実装フェーズと Issue 一覧

### Phase 1 — Walking Skeleton（動く骨格）

| Issue | タイトル | 説明 |
|---|---|---|
| #1 | プロジェクト初期セットアップ | Vite + React + TypeScript + Tailwind CSS |
| #2 | Supabase 初期設定・DB スキーマ作成 | 5テーブル作成・RLS 設定・マイグレーション |
| #3 | 認証機能実装 | LoginForm・AuthContext・ログアウト |

**完了条件**: ログインしてダッシュボードが表示される

---

### Phase 2 — 書類アップロード

| Issue | タイトル | 説明 |
|---|---|---|
| #4 | Storage プライベートバケット設定 | `documents` バケット作成・RLS ポリシー |
| #5 | 書類アップロード画面実装 | 書類種別選択・ファイル選択・プレビュー・Upload |
| #6 | 書類一覧画面実装 | 一覧表示・ステータスフィルター・署名付きURL |

**完了条件**: 画像をアップロードして一覧に表示できる

---

### Phase 3 — 書類確認 UI

| Issue | タイトル | 説明 |
|---|---|---|
| #7 | 書類詳細・確認画面実装 | 画像表示・OCR データ編集・確認OK/差戻し |
| #8 | 操作履歴機能 | `document_history` 記録・履歴表示 |

**完了条件**: 書類を確認済みまたは差戻しにできる

---

### Phase 4 — バッチ自動化

| Issue | タイトル | 説明 |
|---|---|---|
| #9 | バッチ Edge Function 実装 | 確認済み書類の CSV 出力・Storage 保存・実行履歴記録 |
| #10 | GitHub Actions 定期実行設定 | cron スケジュール・手動実行対応 |

**完了条件**: 毎日 20:00 に CSV が自動生成される

---

### Phase 5 — 品質強化

| Issue | タイトル | 説明 |
|---|---|---|
| #11 | エラーハンドリング・ローディング・空状態 UI 統一 | Toast 通知・EmptyState・画像失敗フォールバック |
| #12 | セキュリティ確認・受け入れテスト | RLS 検証・個人情報ログ確認・監査チェック |

**完了条件**: エラー時に日本語メッセージが表示され、セキュリティ監査が完了する

---

## ファイル構成

```
payment-guarantee/
├── .github/
│   └── workflows/
│       └── batch.yml              # GitHub Actions 定期実行
├── docs/
│   ├── 01_requirements.md
│   ├── 02_architecture.md
│   ├── 03_database.md
│   ├── 04_api.md
│   ├── 05_sitemap.md
│   └── implementation_plan.md     # 本ファイル
├── src/
│   ├── components/
│   │   ├── EmptyState.tsx          # 統一空状態コンポーネント
│   │   ├── Layout.tsx              # ナビゲーション付きレイアウト
│   │   └── LoginForm.tsx           # 認証フォーム
│   ├── contexts/
│   │   ├── AuthContext.tsx         # 認証状態管理
│   │   └── ToastContext.tsx        # Toast 通知管理
│   ├── lib/
│   │   └── supabase.ts             # Supabase クライアント初期化
│   ├── pages/
│   │   ├── Dashboard.tsx           # 統計ダッシュボード
│   │   ├── DocumentDetail.tsx      # 書類詳細・確認
│   │   ├── DocumentList.tsx        # 書類一覧
│   │   └── UploadDocument.tsx      # 書類アップロード
│   ├── types/
│   │   └── database.types.ts       # Supabase DB 型定義
│   └── App.tsx                     # ルーティング
├── supabase/
│   ├── functions/
│   │   └── batch-export/
│   │       └── index.ts            # CSV 出力 Edge Function
│   ├── migrations/
│   │   ├── 20260223130158_create_initial_schema.sql
│   │   ├── 20260223130527_create_storage_bucket.sql
│   │   ├── 20260223131000_fix_storage_private.sql
│   │   └── 20260223132000_create_batch_exports_bucket.sql
│   └── config.toml
├── .env                            # 実際の環境変数（gitignore 済み）
├── .env.example                    # 環境変数テンプレート
└── CLAUDE.md                       # Claude Code 向けプロジェクトルール
```

---

## DB テーブル一覧

| テーブル | 用途 | RLS |
|---|---|---|
| `documents` | 書類メタデータ（種別・ステータス・画像キー） | 所有者のみ |
| `document_data` | OCR 抽出データ（氏名・生年月日・住所） | 所有者経由 |
| `document_history` | 全操作の監査ログ（操作者・日時・変更前後） | 所有者経由 |
| `batch_exports` | バッチ実行履歴 | 認証ユーザー閲覧のみ |
| `batch_export_items` | バッチ対象書類の明細 | 認証ユーザー閲覧のみ |

### 書類ステータス遷移

```
uploaded → (ocr_processing → ocr_completed) → confirmed
                                             ↘ rejected
※ OCR フェーズは将来機能。現 MVP では uploaded から直接確認操作へ進む
```

---

## バッチ CSV 仕様

**ファイルパス**: `batch-exports/{YYYY-MM-DD}.csv`（上書き可）

**出力列**:

| 列名 | 内容 |
|---|---|
| 案件ID | `documents.id` |
| 書類種別 | マイナンバーカード / 運転免許証 |
| 氏名 | `document_data.name` |
| 生年月日 | `document_data.birth_date` |
| 住所 | `document_data.address` |
| 画像オブジェクトキー | `documents.image_url` |
| 確認者ID | `document_history.operator_id`（action=confirmed） |
| 確認日時 | `document_history.created_at`（action=confirmed） |
| OCR実行日時 | `document_data.ocr_executed_at`（監査用） |

**対象**: 当日 JST 00:00〜23:59 に `confirmed` になった書類

---

## セキュリティ設計

| 観点 | 対策 |
|---|---|
| 書類画像 | プライベートバケット + 署名付きURL（TTL 1時間） |
| 個人情報ログ | `console.log` ゼロ件。ログには件数・ID のみ記録 |
| RLS | 全テーブルで有効。`auth.uid()` による所有者チェック |
| 監査ログ改ざん防止 | `document_history` に UPDATE/DELETE ポリシーなし |
| シークレット管理 | `.env` は gitignore 済み。service_role は GitHub Secrets のみ |
| XSS | `dangerouslySetInnerHTML` ゼロ件（React デフォルトエスケープ） |
| CSRF | Bearer ヘッダー認証（cookie 不使用） |

---

## 環境変数

| 変数名 | 用途 | ローカル | Vercel | GitHub Secrets |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | Supabase プロジェクト URL | `.env` | ✅ 要登録 | — |
| `VITE_SUPABASE_ANON_KEY` | Supabase 匿名キー（RLS 適用） | `.env` | ✅ 要登録 | — |
| `SUPABASE_URL` | バッチ Edge Function 呼び出し用 URL | — | — | ✅ 要登録 |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function 内で RLS をバイパス | — | — | ✅ 要登録 |

**Vercel への登録手順**: ダッシュボード → プロジェクト → Settings → Environment Variables
（`VITE_` プレフィックスの変数は Vite がビルド時にバンドルに埋め込む。anon キーのみ使用すること）

---

## 将来機能（MVP 対象外）

| 機能 | 概要 |
|---|---|
| AI OCR 統合 | AWS Textract 等で氏名・生年月日・住所を自動抽出 |
| 権限管理 | オペレーター / 管理者 / 監査閲覧専用のロール分離 |
| 手動バッチ実行 | 管理者画面から任意タイミングでバッチ実行 |
| リアルタイム連携 | バッチ CSV 方式から API リアルタイム連携への移行 |
| 通知機能 | 新規アップロード通知・確認期限アラート |
| 書類整合チェック | 複数書類間の記載内容の自動照合 |
