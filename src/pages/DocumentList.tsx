import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { EmptyState } from '../components/EmptyState';
import { FileText, Clock, CheckCircle, XCircle, Eye, ImageOff } from 'lucide-react';

interface Document {
  id: string;
  document_type: 'mynumber_card' | 'drivers_license';
  status: string;
  created_at: string;
  image_url: string;
}

interface DocumentListProps {
  onViewDocument: (id: string) => void;
}

export function DocumentList({ onViewDocument }: DocumentListProps) {
  const { user } = useAuth();
  const { showError } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  // ドキュメントID → 署名付きURL のマップ（有効期限1時間）
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  // 署名付きURL取得に失敗したドキュメントID のセット
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    loadDocuments();
  }, [user]);

  const loadDocuments = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const docs = data || [];
      setDocuments(docs);

      // privateバケットのため、署名付きURLを一括生成する
      const urlMap: Record<string, string> = {};
      const failedIds = new Set<string>();
      await Promise.all(
        docs.map(async (doc) => {
          const { data: signedData, error: signedError } = await supabase.storage
            .from('documents')
            .createSignedUrl(doc.image_url, 3600);
          if (signedData) {
            urlMap[doc.id] = signedData.signedUrl;
          } else if (signedError) {
            failedIds.add(doc.id);
          }
        })
      );
      setSignedUrls(urlMap);
      setFailedImageIds(failedIds);
    } catch (err) {
      showError('書類一覧の取得に失敗しました。再読み込みしてください。');
      console.error('Error loading documents:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'uploaded':
      case 'ocr_processing':
      case 'ocr_completed':
        return {
          label: '確認待ち',
          icon: Clock,
          color: 'text-amber-600 bg-amber-50 border-amber-200',
        };
      case 'confirmed':
        return {
          label: '確認済み',
          icon: CheckCircle,
          color: 'text-green-600 bg-green-50 border-green-200',
        };
      case 'rejected':
        return {
          label: '差戻し',
          icon: XCircle,
          color: 'text-red-600 bg-red-50 border-red-200',
        };
      default:
        return {
          label: status,
          icon: FileText,
          color: 'text-gray-600 bg-gray-50 border-gray-200',
        };
    }
  };

  const getDocumentTypeName = (type: string) => {
    return type === 'mynumber_card' ? 'マイナンバーカード' : '運転免許証';
  };

  const filteredDocuments = documents.filter(doc => {
    if (filter === 'all') return true;
    if (filter === 'pending') return ['uploaded', 'ocr_processing', 'ocr_completed'].includes(doc.status);
    if (filter === 'confirmed') return doc.status === 'confirmed';
    if (filter === 'rejected') return doc.status === 'rejected';
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">書類一覧</h1>
          <p className="text-gray-600">アップロードした書類を確認できます</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {[
          { value: 'all', label: 'すべて' },
          { value: 'pending', label: '確認待ち' },
          { value: 'confirmed', label: '確認済み' },
          { value: 'rejected', label: '差戻し' },
        ].map((option) => (
          <button
            key={option.value}
            onClick={() => setFilter(option.value)}
            className={`px-4 py-2 rounded-lg font-medium transition whitespace-nowrap ${
              filter === option.value
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {filteredDocuments.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="書類がありません"
          description={filter !== 'all' ? 'フィルターを変更してみてください' : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDocuments.map((doc) => {
            const statusInfo = getStatusInfo(doc.status);
            return (
              <div
                key={doc.id}
                className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition group"
              >
                <div className="aspect-video bg-gray-100 overflow-hidden">
                  {signedUrls[doc.id] ? (
                    <img
                      src={signedUrls[doc.id]}
                      alt="Document"
                      className="w-full h-full object-cover group-hover:scale-105 transition"
                    />
                  ) : failedImageIds.has(doc.id) ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                      <ImageOff className="w-10 h-10 text-gray-300" />
                      <span className="text-xs text-gray-400">画像読み込み失敗</span>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <FileText className="w-12 h-12 text-gray-300" />
                    </div>
                  )}
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      {getDocumentTypeName(doc.document_type)}
                    </span>
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${statusInfo.color}`}>
                      <statusInfo.icon className="w-3 h-3" />
                      {statusInfo.label}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    {new Date(doc.created_at).toLocaleString('ja-JP')}
                  </p>
                  <button
                    onClick={() => onViewDocument(doc.id)}
                    className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition flex items-center justify-center gap-2"
                  >
                    <Eye className="w-4 h-4" />
                    詳細を見る
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
