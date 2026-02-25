# 実装計画：操作履歴へのユーザー名表示

## 問題

`DocumentDetail.tsx` の操作履歴セクション（行 453–466）では、
`document_history.operator_id`（UUID）を取得しているが画面に表示していない。
`auth.users` は Supabase Auth が管理しており、クライアント SDK から RLS 経由で
直接参照できないため、メールアドレスなどの人間が読める情報を表示できない。

---

## 解決方針

**`profiles` テーブルを新設し、`auth.users` のメールアドレスを同期する。**

これは Supabase の標準パターン。
- `profiles.id` → `auth.users.id` の FK（1対1）
- DB トリガーで新規ユーザー作成時に自動挿入
- RLS：認証済み全ユーザーが全プロフィールを参照可（オペレーターが再鑑者の名前を確認する必要があるため）

---

## 変更ファイル一覧

| # | 種別 | ファイル | 内容 |
|---|---|---|---|
| 1 | 新規 | `supabase/migrations/20260225100000_create_profiles.sql` | `profiles` テーブル作成・トリガー・RLS |
| 2 | 変更 | `src/pages/DocumentDetail.tsx` | `loadHistory` の修正・HistoryItem 型拡張・履歴 UI 更新 |

---

## 詳細

### 1. マイグレーション：`profiles` テーブル

```sql
-- profiles テーブル作成
CREATE TABLE IF NOT EXISTS profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS：認証済みユーザーは全プロフィールを参照可
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "認証済みユーザーはプロフィールを閲覧可能"
  ON profiles FOR SELECT TO authenticated
  USING (true);

-- 新規ユーザー作成時に自動挿入するトリガー
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 既存ユーザーをバックフィル
INSERT INTO public.profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;
```

---

### 2. `DocumentDetail.tsx` の変更

#### ① `HistoryItem` 型にメールを追加（行 25–35）

```typescript
interface HistoryItem {
  id: string;
  action: string;
  created_at: string;
  operator_id: string;
  operator_email: string | null;  // 追加
  changes: {
    comment?: string;
    old?: unknown;
    new?: unknown;
  };
}
```

#### ② `loadHistory()` を修正（行 150–164）

- `document_history` の全レコードを取得後、ユニークな `operator_id` を抽出
- `profiles` テーブルに対し `.in('id', operatorIds)` でメールを一括取得
- `operator_id → email` のマップを作り、`HistoryItem` にマージして state へセット

```typescript
const loadHistory = async () => {
  // ① 履歴を取得
  const { data, error } = await supabase
    .from('document_history')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const items = (data || []) as Omit<HistoryItem, 'operator_email'>[];

  // ② ユニークな operator_id を抽出してメールを一括取得
  const operatorIds = [...new Set(items.map((h) => h.operator_id))];
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', operatorIds);

  const emailMap: Record<string, string> = {};
  (profilesData || []).forEach((p) => { emailMap[p.id] = p.email; });

  // ③ マージして state へ
  setHistory(
    items.map((h) => ({ ...h, operator_email: emailMap[h.operator_id] ?? null }))
  );
};
```

#### ③ 履歴 UI に操作者を表示（行 453–468）

操作名・日時の下にメールアドレスを小さく追加表示する。

```tsx
<div key={item.id} className="border-l-2 border-blue-200 pl-4 py-2">
  <div className="flex items-center justify-between mb-1">
    <span className="font-medium text-sm">{getActionLabel(item.action)}</span>
    <span className="text-xs text-gray-500">
      {new Date(item.created_at).toLocaleString('ja-JP')}
    </span>
  </div>
  {/* 操作者メール（追加） */}
  {item.operator_email && (
    <p className="text-xs text-gray-500">{item.operator_email}</p>
  )}
  {item.action === 'review_rejected' && item.changes.comment && (
    <p className="text-xs text-gray-600 mt-1">{item.changes.comment}</p>
  )}
</div>
```

---

## 表示イメージ

```
┌─────────────────────────────────────────────┐
│ ■ アップロード          2026/02/25 10:30:00  │
│   tanaka@bank.co.jp                          │
├─────────────────────────────────────────────┤
│ ■ 確認済み              2026/02/25 14:05:00  │
│   yamada@bank.co.jp                          │
├─────────────────────────────────────────────┤
│ ■ 再鑑差戻し            2026/02/25 15:20:00  │
│   suzuki@bank.co.jp                          │
│   住所の記載が不鮮明です。再確認してください。  │
└─────────────────────────────────────────────┘
```

---

## セキュリティ確認

- `profiles` に保存するのは `email` のみ。氏名・生年月日などの個人情報は含まない
- `profiles` の SELECT ポリシーは認証済みユーザー全員に許可（再鑑者がオペレーター名を確認する用途上、必要）
- `profiles` への INSERT/UPDATE/DELETE はアプリ層から不可（トリガーのみ）
- `auth.users` を直接クライアントに公開しない

---

## 補足：既存レコードについて

既存の `document_history` レコードはそのまま使用できる。
マイグレーション末尾のバックフィル SQL により、既存ユーザーの `profiles` レコードが作成されるため、
過去の履歴も含めてメールアドレスを表示できる。
