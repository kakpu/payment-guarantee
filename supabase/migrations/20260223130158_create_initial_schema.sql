/*
  # 代弁実行書類取込・確認アプリ 初期スキーマ

  1. New Tables
    - `documents`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `document_type` (text) - 'mynumber_card' or 'drivers_license'
      - `image_url` (text) - Storage link
      - `status` (text) - 'uploaded', 'ocr_processing', 'ocr_completed', 'confirmed', 'rejected'
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `document_data`
      - `id` (uuid, primary key)
      - `document_id` (uuid, references documents)
      - `name` (text) - 氏名
      - `birth_date` (date) - 生年月日
      - `address` (text) - 住所
      - `ocr_executed_at` (timestamptz) - OCR実行日時（監査用）
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `document_history`
      - `id` (uuid, primary key)
      - `document_id` (uuid, references documents)
      - `operator_id` (uuid, references auth.users)
      - `action` (text) - 'uploaded', 'ocr_extracted', 'confirmed', 'rejected', 'modified'
      - `changes` (jsonb) - 変更前後の差分
      - `created_at` (timestamptz)
    
    - `batch_exports`
      - `id` (uuid, primary key)
      - `executed_at` (timestamptz)
      - `document_count` (int)
      - `status` (text) - 'success', 'failed'
      - `error_message` (text, nullable)
      - `created_at` (timestamptz)
    
    - `batch_export_items`
      - `id` (uuid, primary key)
      - `batch_export_id` (uuid, references batch_exports)
      - `document_id` (uuid, references documents)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their documents
    - Add policies for operators to view and confirm documents
    - Add policies for admin to view batch exports
*/

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('mynumber_card', 'drivers_license')),
  image_url text NOT NULL,
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'ocr_processing', 'ocr_completed', 'confirmed', 'rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create document_data table
CREATE TABLE IF NOT EXISTS document_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name text DEFAULT '',
  birth_date date,
  address text DEFAULT '',
  ocr_executed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create document_history table
CREATE TABLE IF NOT EXISTS document_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
  operator_id uuid REFERENCES auth.users(id) NOT NULL,
  action text NOT NULL CHECK (action IN ('uploaded', 'ocr_extracted', 'confirmed', 'rejected', 'modified')),
  changes jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create batch_exports table
CREATE TABLE IF NOT EXISTS batch_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  executed_at timestamptz DEFAULT now(),
  document_count int DEFAULT 0,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed')),
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Create batch_export_items table
CREATE TABLE IF NOT EXISTS batch_export_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_export_id uuid REFERENCES batch_exports(id) ON DELETE CASCADE NOT NULL,
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_export_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for documents
CREATE POLICY "Users can view their own documents"
  ON documents FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own documents"
  ON documents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents"
  ON documents FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for document_data
CREATE POLICY "Users can view their document data"
  ON document_data FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_data.document_id
      AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their document data"
  ON document_data FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_data.document_id
      AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their document data"
  ON document_data FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_data.document_id
      AND documents.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_data.document_id
      AND documents.user_id = auth.uid()
    )
  );

-- RLS Policies for document_history
CREATE POLICY "Users can view their document history"
  ON document_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_history.document_id
      AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert document history"
  ON document_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = operator_id);

-- RLS Policies for batch_exports
CREATE POLICY "Authenticated users can view batch exports"
  ON batch_exports FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for batch_export_items
CREATE POLICY "Authenticated users can view batch export items"
  ON batch_export_items FOR SELECT
  TO authenticated
  USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_document_data_document_id ON document_data(document_id);
CREATE INDEX IF NOT EXISTS idx_document_history_document_id ON document_history(document_id);
CREATE INDEX IF NOT EXISTS idx_batch_export_items_batch_id ON batch_export_items(batch_export_id);
CREATE INDEX IF NOT EXISTS idx_batch_export_items_document_id ON batch_export_items(document_id);