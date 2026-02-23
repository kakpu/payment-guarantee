export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// @supabase/supabase-js v2.44+ で必要な型フォーマット
export type Database = {
  public: {
    Tables: {
      documents: {
        Row: {
          id: string
          user_id: string
          document_type: 'mynumber_card' | 'drivers_license'
          image_url: string
          status: 'uploaded' | 'ocr_processing' | 'ocr_completed' | 'confirmed' | 'rejected'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          document_type: 'mynumber_card' | 'drivers_license'
          image_url: string
          status?: 'uploaded' | 'ocr_processing' | 'ocr_completed' | 'confirmed' | 'rejected'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          document_type?: 'mynumber_card' | 'drivers_license'
          image_url?: string
          status?: 'uploaded' | 'ocr_processing' | 'ocr_completed' | 'confirmed' | 'rejected'
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_data: {
        Row: {
          id: string
          document_id: string
          name: string
          birth_date: string | null
          address: string
          ocr_executed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          document_id: string
          name?: string
          birth_date?: string | null
          address?: string
          ocr_executed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          name?: string
          birth_date?: string | null
          address?: string
          ocr_executed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'document_data_document_id_fkey'
            columns: ['document_id']
            isOneToOne: true
            referencedRelation: 'documents'
            referencedColumns: ['id']
          }
        ]
      }
      document_history: {
        Row: {
          id: string
          document_id: string
          operator_id: string
          action: 'uploaded' | 'ocr_extracted' | 'confirmed' | 'rejected' | 'modified'
          changes: Json
          created_at: string
        }
        Insert: {
          id?: string
          document_id: string
          operator_id: string
          action: 'uploaded' | 'ocr_extracted' | 'confirmed' | 'rejected' | 'modified'
          changes?: Json
          created_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          operator_id?: string
          action?: 'uploaded' | 'ocr_extracted' | 'confirmed' | 'rejected' | 'modified'
          changes?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'document_history_document_id_fkey'
            columns: ['document_id']
            isOneToOne: false
            referencedRelation: 'documents'
            referencedColumns: ['id']
          }
        ]
      }
      batch_exports: {
        Row: {
          id: string
          executed_at: string
          document_count: number
          status: 'success' | 'failed'
          error_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          executed_at?: string
          document_count?: number
          status?: 'success' | 'failed'
          error_message?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          executed_at?: string
          document_count?: number
          status?: 'success' | 'failed'
          error_message?: string | null
          created_at?: string
        }
        Relationships: []
      }
      batch_export_items: {
        Row: {
          id: string
          batch_export_id: string
          document_id: string
          created_at: string
        }
        Insert: {
          id?: string
          batch_export_id: string
          document_id: string
          created_at?: string
        }
        Update: {
          id?: string
          batch_export_id?: string
          document_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'batch_export_items_batch_export_id_fkey'
            columns: ['batch_export_id']
            isOneToOne: false
            referencedRelation: 'batch_exports'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'batch_export_items_document_id_fkey'
            columns: ['document_id']
            isOneToOne: false
            referencedRelation: 'documents'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
